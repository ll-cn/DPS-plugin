import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from '../config.js'
import { DATA_DIR } from './paths.js'
import { log } from '../log.js'
import { STANDARD5, allChar4, findChar, findWeapon, loadMeta, refreshMeta } from './meta.js'

const FILE = path.join(DATA_DIR, 'banners.json')

const ANN_HOST = 'https://hk4e-api.mihoyo.com/common/hk4e_cn/announcement/api'
const ANN_QUERY =
  'game=hk4e&game_biz=hk4e_cn&lang=zh-cn&bundle_id=hk4e_cn&platform=pc&region=cn_gf01&level=60&uid=100000000'

/** 四个池子的固定展示信息 */
export const POOLS = {
  char1: { id: 'char1', label: '角色活动祈愿', short: '角色池', order: 1 },
  char2: { id: 'char2', label: '角色活动祈愿-2', short: '角色池2', order: 2 },
  weapon: { id: 'weapon', label: '神铸赋形', short: '武器池', order: 3 },
  standard: { id: 'standard', label: '奔行世间', short: '常驻池', order: 4 }
}

let data = null
let refreshing = null
let timer = null

function emptyData() {
  return { updated: 0, version: '', banners: {}, history: [] }
}

/** 读取卡池数据（首次从磁盘加载） */
export function loadBanners() {
  if (data) return data
  try {
    const obj = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    data = obj && typeof obj === 'object' && obj.banners ? obj : emptyData()
  } catch (err) {
    if (err?.code !== 'ENOENT') log('warn', `卡池数据读取失败，已重置：${err?.message ?? err}`)
    data = emptyData()
  }
  if (!Array.isArray(data.history)) data.history = []
  return data
}

function saveBanners() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
    fs.renameSync(tmp, FILE)
  } catch (err) {
    log('error', `卡池数据写盘失败：${err?.message ?? err}`)
  }
}

/** 把 "2026/10/13 18:00" 这类北京时间转成时间戳 */
function toTs(text) {
  const m = String(text || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (!m) return 0
  const [, y, mo, d, h, mi] = m
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${mi}:00+08:00`
  const ts = Date.parse(iso)
  return Number.isFinite(ts) ? ts : 0
}

/** HTML 公告正文转纯文本，`<t>` 里的时间保留 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t\u3000]+/g, ' ')
}

/** 从「称号·名字(属性)」里拆出名字与属性 */
function splitEntry(raw) {
  const text = String(raw || '').replace(/[「」]/g, '').trim()
  const m = text.match(/^(.*?)(?:[（(]([^）)]*)[）)])?$/)
  const body = (m?.[1] || text).trim()
  const element = (m?.[2] || '').trim()
  const parts = body.split('·')
  return { name: parts[parts.length - 1].trim(), title: parts.slice(0, -1).join('·'), element }
}

/** 抽出「N星角色」后面紧跟的「」名单 */
function pickList(text, kind) {
  const out = { 5: [], 4: [] }
  const re = new RegExp(`(\\d)星${kind}((?:「[^」]+」)+)`, 'g')
  let m
  while ((m = re.exec(text)) !== null) {
    const rank = Number(m[1])
    if (rank !== 4 && rank !== 5) continue
    for (const item of m[2].match(/「[^」]+」/g) || []) {
      const entry = splitEntry(item)
      if (!entry.name || out[rank].some(x => x.name === entry.name)) continue
      out[rank].push(entry)
    }
  }
  return out
}

/** 判断这条扭蛋公告属于哪个池子（正文里会同时提到两个角色池，只能认「本祈愿属于」那句） */
function detectPool(title, text) {
  if (/神铸赋形/.test(title)) return 'weapon'
  if (/本祈愿属于「角色活动祈愿-2」/.test(text)) return 'char2'
  if (/本祈愿属于「角色活动祈愿」/.test(text)) return 'char1'
  if (/奔行世间/.test(text) && /常驻/.test(title)) return 'standard'
  return ''
}

/** 单条公告 → 卡池对象 */
function parseAnnouncement(ann, content) {
  const title = String(ann?.title || '')
  const text = htmlToText(content)
  if (!/祈愿/.test(title)) return null

  const pool = detectPool(title, text)
  if (!pool) return null

  const name = (title.match(/「([^」]+)」/) || [])[1] || POOLS[pool]?.label || ''
  const times = text.match(/\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/g) || []
  const startTs = toTs(times[0])
  const endTs = toTs(times[1])

  const chars = pickList(text, '角色')
  const weapons = pickList(text, '武器')

  const banner = {
    id: String(ann?.ann_id || `${pool}-${startTs}`),
    pool,
    name,
    startTs,
    endTs,
    up5: chars[5].map(c => findChar(c.name, c.element)),
    up4: chars[4].map(c => findChar(c.name, c.element)),
    up5Weapon: weapons[5].map(w => findWeapon(w.name, '')),
    up4Weapon: weapons[4].map(w => findWeapon(w.name, '')),
    source: 'announcement'
  }

  if (!banner.up5.length && !banner.up5Weapon.length) return null
  return banner
}

/** 常驻池：公告里没有独立扭蛋公告，用固定阵容生成 */
function buildStandard() {
  const now = Date.now()
  return {
    id: 'standard-permanent',
    pool: 'standard',
    name: '奔行世间',
    startTs: 0,
    endTs: 0,
    up5: STANDARD5.map(n => findChar(n)),
    up4: allChar4().map(n => findChar(n)),
    up5Weapon: [],
    up4Weapon: [],
    permanent: true,
    source: 'local',
    fetchedAt: now
  }
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json', Referer: 'https://ys.mihoyo.com/' },
    signal: AbortSignal.timeout(CONFIG.timeout)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** 从公告列表推断当前版本号 */
function detectVersion(anns) {
  const counter = new Map()
  for (const ann of anns) {
    for (const v of String(ann?.title || '').match(/(?<!\d)(\d{1,2}\.\d)(?!\d)/g) || []) {
      const [, major, minor] = v.match(/(\d{1,2})\.(\d)/) || []
      if (!major) continue
      counter.set(v, (counter.get(v) || 0) + 1)
    }
  }
  const list = [...counter].sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))
  return list.length ? list[0][0] : ''
}

/**
 * 拉取并解析全部祈愿公告，合并进本地卡池数据。
 * 历史卡池只增不删，公告过期后仍可查询。
 */
export async function refreshBanners({ meta = true } = {}) {
  if (refreshing) return refreshing
  refreshing = (async () => {
    loadBanners()
    const result = { ok: false, updated: 0, version: '', pools: [], meta: null, errors: [] }

    if (meta) {
      try {
        result.meta = await refreshMeta()
      } catch (err) {
        result.errors.push(`角色库：${err?.message ?? err}`)
      }
      loadMeta()
    }

    let anns = []
    try {
      const list = await getJson(`${ANN_HOST}/getAnnList?${ANN_QUERY}`)
      if (list?.retcode !== 0) throw new Error(`公告接口返回 ${list?.retcode ?? '?'}`)
      anns = (list?.data?.list || []).flatMap(g => g?.list || [])
    } catch (err) {
      result.errors.push(`公告列表：${err?.message ?? err}`)
      log('warn', `拉取祈愿公告失败：${err?.message ?? err}`)
      return result
    }

    result.version = detectVersion(anns)

    const gacha = anns.filter(
      a => a?.tag_label === '扭蛋' && a?.type_label !== '千星奇域' && /祈愿/.test(a?.title || '')
    )
    if (!gacha.length) {
      result.errors.push('公告里没有找到祈愿条目')
      return result
    }

    let contents = {}
    try {
      const body = await getJson(`${ANN_HOST}/getAnnContent?${ANN_QUERY}`)
      for (const item of body?.data?.list || []) contents[item.ann_id] = item.content
    } catch (err) {
      result.errors.push(`公告正文：${err?.message ?? err}`)
    }

    const parsed = gacha.map(a => parseAnnouncement(a, contents[a.ann_id])).filter(Boolean)
    if (!parsed.length) {
      result.errors.push('公告解析结果为空（公告格式可能变了）')
      return result
    }

    const now = Date.now()
    const fresh = {}
    for (const banner of parsed) {
      const cur = fresh[banner.pool]
      if (!cur || banner.startTs > cur.startTs) fresh[banner.pool] = banner
    }

    for (const [pool, banner] of Object.entries(fresh)) {
      banner.fetchedAt = now
      data.banners[pool] = banner
      const hit = data.history.find(h => h.id === banner.id)
      if (hit) Object.assign(hit, banner)
      else data.history.push({ ...banner })
    }

    if (!data.banners.standard) data.banners.standard = buildStandard()
    else data.banners.standard = { ...buildStandard(), fetchedAt: data.banners.standard.fetchedAt || now }

    data.updated = now
    data.version = result.version || data.version
    saveBanners()

    result.ok = true
    result.updated = now
    result.pools = Object.keys(fresh)
    log('mark', `卡池已更新：${result.pools.join('、')}｜版本 ${result.version || '?'}`)
    return result
  })()

  try {
    return await refreshing
  } finally {
    refreshing = null
  }
}

/** 当前卡池（按时间过滤，常驻池始终有效） */
export function currentBanners() {
  const store = loadBanners()
  const now = Date.now()
  const out = {}
  for (const [id, banner] of Object.entries(store.banners || {})) {
    if (!banner) continue
    if (banner.permanent) {
      out[id] = banner
      continue
    }
    const started = !banner.startTs || banner.startTs <= now
    const ended = banner.endTs && banner.endTs < now
    if (started && !ended) out[id] = banner
  }
  return out
}

/** 卡池是否已过期（用于抽卡前自动刷新） */
export function isStale() {
  const store = loadBanners()
  const now = Date.now()
  const list = Object.values(store.banners || {}).filter(b => b && !b.permanent)
  if (!list.length) return true
  if (now - (store.updated || 0) > 12 * 3600 * 1000) return true
  return list.every(b => b.endTs && b.endTs < now)
}

/** 取指定池子的卡池，过期则回退到最近一期 */
export function getPool(poolId) {
  const store = loadBanners()
  const current = currentBanners()
  if (current[poolId]) return current[poolId]
  const past = (store.history || [])
    .filter(b => b.pool === poolId)
    .sort((a, b) => b.startTs - a.startTs)
  return past[0] || null
}

/** 卡池剩余时间文案 */
export function leftText(banner) {
  if (!banner?.endTs) return '长期开放'
  const ms = banner.endTs - Date.now()
  if (ms <= 0) return '已结束'
  const day = Math.floor(ms / 86400000)
  const hour = Math.floor((ms % 86400000) / 3600000)
  if (day > 0) return `剩 ${day} 天 ${hour} 小时`
  const min = Math.floor((ms % 3600000) / 60000)
  return `剩 ${hour} 小时 ${min} 分`
}

/** 卡池时间文案（北京时间） */
export function rangeText(banner) {
  if (!banner?.startTs || !banner?.endTs) return '长期开放'
  const fmt = ts => {
    const d = new Date(ts + 8 * 3600 * 1000)
    const p = n => String(n).padStart(2, '0')
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  }
  return `${fmt(banner.startTs)} ~ ${fmt(banner.endTs)}`
}

/** 启动定时刷新 */
export function startScheduler() {
  if (timer) return
  const minutes = CONFIG.refreshMinutes
  setTimeout(() => {
    refreshBanners().catch(err => log('warn', `启动刷新卡池失败：${err?.message ?? err}`))
  }, 8000)
  if (!minutes || minutes <= 0) return
  timer = setInterval(() => {
    refreshBanners().catch(err => log('warn', `定时刷新卡池失败：${err?.message ?? err}`))
  }, minutes * 60000)
  if (typeof timer.unref === 'function') timer.unref()
  log('info', `卡池定时刷新已开启：每 ${minutes} 分钟`)
}

/** 抽卡前确保卡池可用，过期时静默刷新一次 */
export async function ensureFresh() {
  if (!isStale()) return false
  const r = await refreshBanners()
  return r.ok
}

/** 卡池数据概况 */
export function bannerInfo() {
  const store = loadBanners()
  return {
    updated: store.updated,
    version: store.version,
    pools: Object.keys(store.banners || {}),
    history: (store.history || []).length
  }
}

loadBanners()
