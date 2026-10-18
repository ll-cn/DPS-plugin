import fs from 'node:fs'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG } from './config.js'
import { log } from './log.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')

/** 接口地址 */
const API_TEAMS = 'https://www.mhydps.cn/api/teams'
const API_TEAMS2 = 'https://www.mhydps.cn/api/teams2'
const REFERER = 'https://www.mhydps.cn/'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** 两套数据各自的缓存槽（teams=DPS榜，teams2=危战榜） */
export const caches = {
  teams: { at: 0, data: null },
  teams2: { at: 0, data: null }
}
const inflights = {}

function buildHeaders() {
  return {
    'User-Agent': UA,
    Referer: REFERER,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin'
  }
}

/** 把网络异常翻译成人话 + 排查提示 */
function classify(err) {
  const msg = err?.message ?? String(err)
  const code = err?.cause?.code || err?.code || ''
  const http = msg.match(/^HTTP (\d{3})/)

  if (err?.name === 'AbortError' || msg === '请求超时')
    return { err: '请求超时', hint: '接口响应慢，稍后再试。', retry: true }
  if (http) {
    const s = Number(http[1])
    if (s === 403 || s === 429 || s === 503)
      return { err: `HTTP ${s}`, hint: '接口有 Cloudflare 防护，稍后再试。', retry: false }
    return { err: `HTTP ${s}`, hint: '接口返回异常，稍后再试。', retry: s >= 500 }
  }
  if (/不是 JSON/.test(msg))
    return { err: msg, hint: '接口有 Cloudflare 防护，稍后再试。', retry: false }

  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return { err: `域名解析失败（${code}）`, hint: '机器人这台机器的 DNS 有问题，检查网络/DNS 设置。', retry: false }
    case 'ECONNREFUSED':
      return { err: `连接被拒绝（${code}）`, hint: '本机网络或防火墙拦了，检查网络。', retry: true }
    case 'ECONNRESET':
    case 'EPIPE':
    case 'UND_ERR_SOCKET':
    case 'UND_ERR_CLOSED':
      return { err: `连接被中断（${code}）`, hint: '网络不稳，稍后再试。', retry: true }
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
    case 'UND_ERR_HEADERS_TIMEOUT':
    case 'UND_ERR_BODY_TIMEOUT':
      return { err: `连接超时（${code}）`, hint: '网络连不上接口，检查机器人网络。', retry: true }
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return { err: `证书校验失败（${code}）`, hint: '可能有安全软件/代理在拦 HTTPS。', retry: false }
  }
  return {
    err: `网络请求失败（${code || '未知原因'}）`,
    hint: '机器人这台机器连不上 mhydps.cn，检查 DNS、防火墙或代理。',
    retry: true
  }
}

function parseJson(text) {
  if (!/^\s*[[{]/.test(text)) throw new Error('返回的不是 JSON（可能被 Cloudflare 拦了）')
  return JSON.parse(text)
}

async function fetchJson(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CONFIG.timeout)
  try {
    const res = await fetch(url, { headers: buildHeaders(), signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseJson(await res.text())
  } finally {
    clearTimeout(timer)
  }
}

/** Node 自带 https 兜底（个别环境下 fetch 用不了，但 https 可以） */
function httpsJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: buildHeaders(), timeout: CONFIG.timeout }, res => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let text = ''
      res.setEncoding('utf8')
      res.on('data', c => (text += c))
      res.on('end', () => {
        try {
          resolve(parseJson(text))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
  })
}

/** 部分网络下 Node 的自动 IPv4/IPv6 选择会直接失败，关掉再试 */
let autoSelectTuned = false
function tuneAutoSelect() {
  if (autoSelectTuned) return
  autoSelectTuned = true
  try {
    if (typeof net.setDefaultAutoSelectFamily === 'function') {
      net.setDefaultAutoSelectFamily(false)
      log('warn', '关闭 autoSelectFamily 后重试')
    }
  } catch {
    /* 忽略 */
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getJson(url) {
  let last
  for (let i = 0; i < 3; i++) {
    try {
      return await fetchJson(url)
    } catch (err) {
      last = err
      if (!classify(err).retry) throw err
      if (i === 0) tuneAutoSelect()
      if (i < 2) await sleep(600 * (i + 1))
    }
  }
  try {
    return await httpsJson(url)
  } catch (err) {
    last = err
  }
  throw last
}

function diskFile(kind) {
  return path.join(DATA_DIR, `${kind}.json`)
}

/** 上次成功拉到的数据存一份，网络挂了也能顶一下 */
function saveDisk(kind, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(diskFile(kind), JSON.stringify(data))
  } catch (err) {
    log('warn', `写入本地缓存失败：${err?.message ?? err}`)
  }
}

function readDisk(kind) {
  try {
    const data = JSON.parse(fs.readFileSync(diskFile(kind), 'utf8'))
    return Array.isArray(data) && data.length ? data : null
  } catch {
    return null
  }
}

/**
 * 拉取数据（带缓存 + 并发合并）
 * @param {'teams'|'teams2'} kind teams=DPS榜数据，teams2=危战数据
 * @param {boolean} force 强制刷新
 */
export async function fetchData(kind, force = false) {
  const url = kind === 'teams2' ? API_TEAMS2 : API_TEAMS
  const slot = caches[kind]
  const now = Date.now()

  if (!force && slot.data && now - slot.at < CONFIG.cacheTime) {
    return { ok: true, data: slot.data, cached: true }
  }
  if (inflights[kind]) return inflights[kind]

  inflights[kind] = (async () => {
    try {
      const data = await getJson(url)
      if (!Array.isArray(data)) throw new Error('返回数据格式异常（不是数组）')
      slot.at = Date.now()
      slot.data = data
      saveDisk(kind, data)
      log('mark', `${kind === 'teams2' ? '危战' : 'DPS'} 数据已更新：共 ${data.length} 条队伍`)
      return { ok: true, data, cached: false }
    } catch (err) {
      const info = classify(err)
      const code = err?.cause?.code || err?.code || ''
      log('error', `拉取 ${kind} 数据失败：${info.err}${code && !info.err.includes(code) ? `（${code}）` : ''}｜${err?.message ?? ''}`)

      if (slot.data) return { ok: true, data: slot.data, cached: true, err: info.err }

      const disk = readDisk(kind)
      if (disk) {
        slot.data = disk
        slot.at = 0
        log('warn', `${kind} 网络不可用，改用本地缓存兜底（${disk.length} 条）`)
        return { ok: true, data: disk, cached: true, stale: true, err: info.err }
      }
      return { ok: false, err: info.err, hint: info.hint }
    } finally {
      inflights[kind] = null
    }
  })()

  return inflights[kind]
}

/** 取 DPS 榜数据（语义化别名） */
export const fetchTeams = (force = false) => fetchData('teams', force)
