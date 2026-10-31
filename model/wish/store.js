import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './paths.js'
import { log } from '../log.js'

const FILE = path.join(DATA_DIR, 'records.json')
const MAX_RECORDS = 500

let db = null
let dirty = false
let timer = null

function emptyDb() {
  return { version: 1, players: {} }
}

function load() {
  if (db) return db
  try {
    const obj = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    db = obj && typeof obj === 'object' && obj.players ? obj : emptyDb()
  } catch (err) {
    if (err?.code !== 'ENOENT') log('warn', `抽卡记录读取失败，已重置：${err?.message ?? err}`)
    db = emptyDb()
  }
  return db
}

/** 原子写盘：先写临时文件再 rename，避免中断时留下半个 json */
function writeNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(db), 'utf8')
    fs.renameSync(tmp, FILE)
    dirty = false
  } catch (err) {
    log('error', `抽卡记录写盘失败：${err?.message ?? err}`)
  }
}

/** 标记有改动，延迟合并写盘 */
export function touch() {
  dirty = true
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    if (dirty) writeNow()
  }, 800)
  if (typeof timer.unref === 'function') timer.unref()
}

/** 立即落盘 */
export function flush() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (dirty) writeNow()
}

/** 「群 + QQ」维度的玩家键，私聊用 private 前缀 */
export function playerKey(gid, uid) {
  return `${gid || 'private'}:${uid}`
}

/** 空白档案：每个池子独立计数 */
export function blankPlayer(gid, uid) {
  return {
    gid: String(gid || 'private'),
    uid: String(uid),
    pools: {},
    records: [],
    stars5: [],
    total: 0,
    daily: { date: '', count: 0 },
    created: Date.now()
  }
}

/** 取玩家档案（不存在则新建空档案） */
export function getPlayer(gid, uid) {
  const store = load()
  const key = playerKey(gid, uid)
  let p = store.players[key]
  if (!p || typeof p !== 'object') {
    p = blankPlayer(gid, uid)
    store.players[key] = p
  }
  if (!Array.isArray(p.records)) p.records = []
  if (!Array.isArray(p.stars5)) p.stars5 = []
  if (!p.pools || typeof p.pools !== 'object') p.pools = {}
  if (!p.daily || typeof p.daily !== 'object') p.daily = { date: '', count: 0 }
  return p
}

/** 取某个池子的计数状态（不存在或字段缺失时用 init 补齐） */
export function poolState(p, poolId, init) {
  let s = p.pools[poolId]
  if (!s || typeof s !== 'object') {
    s = { ...init }
    p.pools[poolId] = s
  }
  for (const [k, v] of Object.entries(init)) {
    if (typeof s[k] !== typeof v || (typeof v === 'number' && !Number.isFinite(s[k]))) s[k] = v
  }
  return s
}

/** 追加一条抽卡结果；三星不进记录，总数照算 */
export function pushRecord(p, item) {
  p.total = (Number(p.total) || 0) + 1
  if (item.rank >= 4) {
    p.records.push(item)
    if (p.records.length > MAX_RECORDS) p.records.splice(0, p.records.length - MAX_RECORDS)
  }
  touch()
}

/** 记录一个五星（长期保留） */
export function pushStar5(p, item) {
  p.stars5.push(item)
  if (p.stars5.length > MAX_RECORDS) p.stars5.splice(0, p.stars5.length - MAX_RECORDS)
  touch()
}

/** 某个群的全部玩家（用于排行） */
export function groupPlayers(gid) {
  const store = load()
  const target = String(gid || 'private')
  return Object.values(store.players).filter(p => String(p?.gid) === target)
}

/** 已建档玩家数（诊断用） */
export function rawCount() {
  return Object.keys(load().players || {}).length
}

export { FILE as RECORD_FILE }
