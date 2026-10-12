import { CONFIG } from './config.js'
import { log } from './log.js'

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

async function getJson(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CONFIG.timeout)
  try {
    const res = await fetch(url, { headers: buildHeaders(), signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!/^\s*[[{]/.test(text)) throw new Error('返回的不是 JSON（可能被 Cloudflare 拦了）')
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
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
      log('mark', `${kind === 'teams2' ? '危战' : 'DPS'} 数据已更新：共 ${data.length} 条队伍`)
      return { ok: true, data, cached: false }
    } catch (err) {
      const msg = err?.name === 'AbortError' ? '请求超时' : (err?.message ?? String(err))
      log('error', `拉取 ${kind} 数据失败：${msg}`)
      if (slot.data) return { ok: true, data: slot.data, cached: true, err: msg }
      return { ok: false, err: msg }
    } finally {
      inflights[kind] = null
    }
  })()

  return inflights[kind]
}

/** 取 DPS 榜数据（语义化别名） */
export const fetchTeams = (force = false) => fetchData('teams', force)
