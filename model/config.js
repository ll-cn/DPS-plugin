import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const CONFIG_FILE = path.join(__dirname, '..', 'config', 'config.yaml')

const DEFAULTS = {
  cacheTime: 5 * 60 * 1000,
  timeout: 25 * 1000,
  perPage: 20,
  maxPage: 30,
  lowCost: 2,
  jpegQuality: 90,
  imageScale: 2,
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

/** 配置文件缺失/为空时写回的默认内容 */
const DEFAULT_YAML = `# ===================== 原神DPS 插件配置 =====================
# 改完保存即时生效（每次查询会检查文件是否变动，不用重启）。
# 删掉本文件后，下次查询会自动重新生成这份默认配置。

# 数据缓存时长（毫秒）。官方建议 >= 5 分钟，请求太频繁会被 Cloudflare 拦。
cacheTime: 300000

# 单次请求超时（毫秒）
timeout: 25000

# 出图清晰度倍数（1=原尺寸；2=两倍像素，手机上更清晰，图也更大）
imageScale: 2

# 出图质量（0-100，越低图越小）
jpegQuality: 90

# 只发文字不发图（默认关闭；开启后所有查询都只发文字）
textOnly: false

# 榜单每页显示条数
perPage: 20

# 最多翻到第几页
maxPage: 30

# 危战「低金」筛选的金数上限（与网站低金榜口径一致）
lowCost: 2

# 角色俗称 -> 接口里的官方角色名
# 例：#dps配队 少女  → 实际查的是「哥伦比亚」
alias:
  少女: 哥伦比亚
  火王: 玛薇卡
  火神: 玛薇卡
  水神: 芙宁娜
  草神: 纳西妲
  雷神: 雷电将军
  冰神: 至冬女皇
`

export const CONFIG = { ...DEFAULTS }
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

/** 生成默认配置文件（缺失或空文件时） */
function ensureConfigFile() {
  try {
    if (fs.existsSync(CONFIG_FILE) && fs.statSync(CONFIG_FILE).size > 0) return
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
    fs.writeFileSync(CONFIG_FILE, DEFAULT_YAML, 'utf8')
    globalThis.logger?.mark?.(`[原神DPS] 配置文件不存在，已生成默认配置：${CONFIG_FILE}`)
  } catch (err) {
    globalThis.logger?.warn?.(`[原神DPS] 生成默认配置失败：${err?.message ?? err}`)
  }
}

let lastMtime = -1

export function loadConfig(force = false) {
  if (!fs.existsSync(CONFIG_FILE) || fs.statSync(CONFIG_FILE).size === 0) {
    ensureConfigFile()
    force = true
  }

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
      globalThis.logger?.warn?.(`[原神DPS] config.yaml 解析失败，改用默认配置：${err?.message ?? err}`)
      raw = {}
    }
  }

  CONFIG.cacheTime = posNum(raw.cacheTime, DEFAULTS.cacheTime)
  CONFIG.timeout = posNum(raw.timeout, DEFAULTS.timeout)
  CONFIG.perPage = Math.max(1, Math.floor(posNum(raw.perPage, DEFAULTS.perPage)))
  CONFIG.maxPage = Math.max(1, Math.floor(posNum(raw.maxPage, DEFAULTS.maxPage)))
  CONFIG.lowCost = Number.isFinite(Number(raw.lowCost)) ? Number(raw.lowCost) : DEFAULTS.lowCost
  CONFIG.jpegQuality = Math.min(
    100,
    Math.max(30, Math.floor(posNum(raw.jpegQuality, DEFAULTS.jpegQuality)))
  )
  CONFIG.imageScale = Math.min(3, Math.max(1, Number(raw.imageScale) || DEFAULTS.imageScale))
  CONFIG.textOnly = raw.textOnly === true || raw.textOnly === 'true'

  for (const k of Object.keys(ALIAS)) delete ALIAS[k]
  Object.assign(ALIAS, DEFAULT_ALIAS, raw.alias && typeof raw.alias === 'object' ? raw.alias : {})
}

/** 是否强制纯文字输出（config.yaml 的 textOnly 开关，默认关） */
export function needTextOnly() {
  return CONFIG.textOnly === true
}

ensureConfigFile()
loadConfig(true)
