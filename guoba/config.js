import { ALIAS, CONFIG, loadConfig, updateConfig } from '../model/config.js'

/** 数值项：[最小, 最大, 默认] */
const NUM_FIELDS = {
  cacheTime: [60000, 3600000, 300000],
  timeout: [5000, 60000, 25000],
  perPage: [1, 50, 20],
  maxPage: [1, 100, 30],
  lowCost: [0, 10, 2],
  jpegQuality: [30, 100, 90]
}

const BOOL_FIELDS = ['textOnly']

function toNum(v, min, max, def) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** 「俗称: 官方名」每行一条 → 对象 */
function parseAliasText(text) {
  const out = {}
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const i = s.search(/[:：]/)
    if (i <= 0) continue
    const key = s.slice(0, i).trim()
    const val = s.slice(i + 1).trim()
    if (key && val) out[key] = val
  }
  return out
}

function aliasText() {
  return Object.entries(ALIAS)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

/** 面板读取：返回与 schema 字段同名的对象 */
export async function getConfigData() {
  loadConfig()
  return {
    cacheTime: CONFIG.cacheTime,
    timeout: CONFIG.timeout,
    perPage: CONFIG.perPage,
    maxPage: CONFIG.maxPage,
    lowCost: CONFIG.lowCost,
    aliasText: aliasText(),
    imageScale: CONFIG.imageScale,
    jpegQuality: CONFIG.jpegQuality,
    textOnly: CONFIG.textOnly
  }
}

/** 面板保存：校验后写回 config.yaml，并立即生效 */
export async function setConfigData(data, { Result }) {
  if (!data || typeof data !== 'object') return Result.error('没有收到配置数据')

  const patch = {}
  for (const [key, [min, max, def]] of Object.entries(NUM_FIELDS)) {
    const v = data[key]
    if (v === undefined || v === null || v === '') continue
    patch[key] = toNum(v, min, max, def)
  }

  const scale = Number(data.imageScale)
  if (data.imageScale !== undefined && Number.isFinite(scale)) {
    patch.imageScale = Math.min(3, Math.max(1, Math.round(scale)))
  }

  for (const key of BOOL_FIELDS) {
    if (data[key] === undefined || data[key] === null) continue
    patch[key] = data[key] === true || data[key] === 'true'
  }

  if (data.aliasText !== undefined) patch.alias = parseAliasText(data.aliasText)

  const count = Object.keys(patch).length
  if (!count) return Result.error('没有可保存的配置项')
  if (!updateConfig(patch)) return Result.error('写入 config/config.yaml 失败，请查看机器人日志')

  return Result.ok(null, `已保存 ${count} 项，即时生效`)
}
