import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './log.js'
import { versionHtml } from './version.js'
import { CONFIG } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 外置渲染服务失败后的冷却截止时间 */
let rsDownUntil = 0

/** 插件自己的 resources 目录（放 html 模板） */
export const RES_DIR = path.join(__dirname, '..', 'resources')
export const TPL_TEAMS = path.join(RES_DIR, 'teams.html')
export const TPL_WEIZHAN = path.join(RES_DIR, 'weizhan.html')
export const TPL_HELP = path.join(RES_DIR, 'help.html')

/** 插件根目录（克隆到的目录，随目录名变化） */
export const PLUGIN_ROOT = path.dirname(RES_DIR)
/** 插件目录名 */
export const PLUGIN_DIR_NAME = path.basename(PLUGIN_ROOT)

/** 缺失的模板文件列表（空数组 = 都在） */
export function missingTplList() {
  return [
    [TPL_TEAMS, 'resources/teams.html'],
    [TPL_WEIZHAN, 'resources/weizhan.html'],
    [TPL_HELP, 'resources/help.html']
  ]
    .filter(([p]) => {
      try {
        return !fs.existsSync(p)
      } catch {
        return true
      }
    })
    .map(([, n]) => n)
}

/** 渲染失败时给用户的提示（区分「模板缺失」和「渲染后端问题」） */
export function renderFailMsg() {
  const miss = missingTplList()
  if (miss.length) {
    return [
      '😵 缺少模板文件，生成不了图片。',
      `缺失：${miss.join('、')}`,
      '',
      '插件必须把整个仓库克隆到 plugins/ 下（不能只放 js）：',
      `  git clone https://github.com/ll-cn/DPS-plugin.git "plugins/${PLUGIN_DIR_NAME}"`,
      '它依赖 resources/ 下的 3 个 html 模板，只放 js 是跑不起图的。'
    ].join('\n')
  }
  return '😵 图片生成失败，请检查渲染后端（puppeteer/shotium）是否正常。'
}

/** 渲染失败的一行简短提示（用在「已降级为文字」的场景，避免群里只看到文字却没头绪） */
export function renderFailBrief() {
  const miss = missingTplList()
  if (miss.length) return `图片渲染失败：缺模板 ${miss.join('、')}，请克隆整个仓库`
  return '图片渲染失败：Chromium / puppeteer 不可用，详见机器人日志'
}

/** 头像 data URI 缓存 */
const dataUriCache = new Map()

/** 把 file:// 图片转成 data URI */
function toDataUri(src) {
  if (typeof src !== 'string' || !src.startsWith('file:')) return src
  if (dataUriCache.has(src)) return dataUriCache.get(src)
  try {
    const file = decodeURIComponent(src.replace(/^file:\/{2,3}/, ''))
    const buf = fs.readFileSync(file)
    const ext = path.extname(file).slice(1).toLowerCase()
    const mime =
      ext === 'webp'
        ? 'image/webp'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/png'
    const uri = `data:${mime};base64,${buf.toString('base64')}`
    dataUriCache.set(src, uri)
    return uri
  } catch {
    return src
  }
}

/** 把 face 字段的 file:// 图片内联成 data URI（外置服务是 setContent 注入，file:// 会被拦） */
function inlineImages(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return
  if (Array.isArray(node)) {
    for (const item of node) inlineImages(item, depth + 1)
    return
  }
  if (typeof node.face === 'string') node.face = toDataUri(node.face)
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') inlineImages(v, depth + 1)
  }
}

/** 走外置渲染服务（如 pupu）：POST {url}/render，失败返回 null 由调用方回退 */
async function renderViaServer(tplFile, data) {
  const rs = CONFIG.renderServer
  const url = `${String(rs.url).replace(/\/+$/, '')}/render`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), rs.timeout)

  try {
    const payloadData = JSON.parse(JSON.stringify(data))
    inlineImages(payloadData)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(rs.token ? { authorization: rs.token } : {})
      },
      body: JSON.stringify({
        file: tplFile,
        data: payloadData,
        type: 'jpeg',
        quality: CONFIG.jpegQuality,
        // 截 body 元素，与云崽渲染器一致
        selector: 'body',
        fullPage: false,
        encoding: 'binary',
        setViewport: { width: 800, height: 800, deviceScaleFactor: 1 }
      }),
      signal: ctrl.signal
    })

    if (!res.ok) {
      log('warn', `外置渲染服务返回 HTTP ${res.status}`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) {
      log('warn', '外置渲染服务返回空内容')
      return null
    }
    return buf
  } catch (err) {
    const msg = err?.name === 'AbortError' ? '请求超时' : (err?.message ?? err)
    log('warn', `外置渲染服务不可用：${msg}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 通用渲染
 * @param {string} tplFile 模板绝对路径
 * @param {string} name 渲染器任务名（用于 temp/html 目录与日志）
 * @param {object} data 模板数据
 * @returns {Promise<Buffer|Buffer[]|null>}
 */
export async function renderTo(tplFile, name, data) {
  if (!fs.existsSync(tplFile)) {
    log('error', `模板不存在：${tplFile}`)
    return null
  }

  const tplData = {
    // 页脚版本号
    versionHtml: versionHtml(),
    ...data
  }

  // 优先走外置渲染服务
  if (CONFIG.renderServer?.enable && Date.now() > rsDownUntil) {
    const img = await renderViaServer(tplFile, tplData)
    if (img) {
      rsDownUntil = 0
      return img
    }
    rsDownUntil = Date.now() + 60 * 1000
    log('warn', `外置渲染服务不可用，已回退云崽渲染器（${name}）`)
  }

  // 回退云崽渲染器
  try {
    const loader = (await import('../../../lib/renderer/loader.js')).default
    const renderer = loader.getRenderer()
    const img = await renderer.render(name, {
      tplFile,
      saveId: `${name}-${Date.now()}`,
      // jpeg 质量
      quality: CONFIG.jpegQuality,
      ...tplData
    })
    if (!img) {
      log('error', `渲染返回空：${name}`)
      return null
    }
    return img
  } catch (err) {
    log('error', `渲染失败（${name}）：${err?.stack ?? err}`)
    return null
  }
}
