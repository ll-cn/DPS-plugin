import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const CONFIG_FILE = path.join(__dirname, '..', 'config', 'config.yaml')

const DEFAULTS = {
  cacheTime: 5 * 60 * 1000,
  timeout: 25 * 1000,
  perPage: 5,
  maxPage: 30,
  lowCost: 2,
  jpegQuality: 80,
  textOnly: false
}

const DEFAULT_ALIAS = {
  少女: '哥伦比亚',
  火王: '玛薇卡',
  火神: '玛薇卡',
  水神: '芙宁娜',
  草神: '纳西妲',
  雷神: '雷电将军',
  冰神: '至冬女皇'
}

/** 外置渲染服务默认值（url 留空，由用户自己填） */
const DEFAULT_RENDER_SERVER = {
  enable: false,
  url: '',
  token: '',
  timeout: 60 * 1000
}

export const CONFIG = { ...DEFAULTS, renderServer: { ...DEFAULT_RENDER_SERVER } }
export const ALIAS = { ...DEFAULT_ALIAS }

let yamlLib
try {
  yamlLib = (await import('yaml')).default
} catch {
  yamlLib = null
}

function posNum(v, def) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : def
}

/** token 可能是数字，统一成字符串 */
function normalizeRenderServer(v) {  const d = DEFAULT_RENDER_SERVER
  if (!v || typeof v !== 'object') return { ...d }
  return {
    enable: v.enable === true || v.enable === 'true',
    url: typeof v.url === 'string' && v.url.trim() ? v.url.trim() : d.url,
    token: v.token == null ? '' : String(v.token),
    timeout: posNum(v.timeout, d.timeout)
  }
}

let lastMtime = -1

export function loadConfig(force = false) {
  let mtime = 0
  try {
    mtime = fs.statSync(CONFIG_FILE).mtimeMs
  } catch {
    mtime = 0
  }
  if (!force && mtime === lastMtime) return
  lastMtime = mtime

  let raw = {}
  if (yamlLib && mtime) {
    try {
      raw = yamlLib.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) ?? {}
    } catch (err) {
      logger?.warn?.(`[原神DPS] config.yaml 解析失败，改用默认配置：${err?.message ?? err}`)
      raw = {}
    }
  }

  CONFIG.cacheTime = posNum(raw.cacheTime, DEFAULTS.cacheTime)
  CONFIG.timeout = posNum(raw.timeout, DEFAULTS.timeout)
  CONFIG.perPage = Math.max(1, Math.floor(posNum(raw.perPage, DEFAULTS.perPage)))
  CONFIG.maxPage = Math.max(1, Math.floor(posNum(raw.maxPage, DEFAULTS.maxPage)))
  CONFIG.lowCost = Number.isFinite(Number(raw.lowCost)) ? Number(raw.lowCost) : DEFAULTS.lowCost
  CONFIG.renderServer = normalizeRenderServer(raw.renderServer)
  CONFIG.jpegQuality = Math.min(
    100,
    Math.max(30, Math.floor(posNum(raw.jpegQuality, DEFAULTS.jpegQuality)))
  )
  CONFIG.textOnly = raw.textOnly === true || raw.textOnly === 'true'

  for (const k of Object.keys(ALIAS)) delete ALIAS[k]
  Object.assign(ALIAS, DEFAULT_ALIAS, raw.alias && typeof raw.alias === 'object' ? raw.alias : {})
}

/** 是否强制纯文字输出（config.yaml 的 textOnly 开关，默认关） */
export function needTextOnly() {
  return CONFIG.textOnly === true
}

loadConfig(true)
