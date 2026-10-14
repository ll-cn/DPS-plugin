import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './log.js'
import { versionHtml } from './version.js'
import { CONFIG } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 外置渲染服务失败后的冷却截止时间 */
let rsDownUntil = 0

export const RES_DIR = path.join(__dirname, '..', 'resources')
export const TPL_TEAMS = path.join(RES_DIR, 'teams.html')
export const TPL_WEIZHAN = path.join(RES_DIR, 'weizhan.html')
export const TPL_HELP = path.join(RES_DIR, 'help.html')

export const PLUGIN_ROOT = path.dirname(RES_DIR)
export const PLUGIN_DIR_NAME = path.basename(PLUGIN_ROOT)

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

export function renderFailBrief() {
  const miss = missingTplList()
  if (miss.length) return `图片渲染失败：缺模板 ${miss.join('、')}，请克隆整个仓库`
  return '图片渲染失败：Chromium / puppeteer 不可用，详见机器人日志'
}

/** 系统自带浏览器候选路径 */
function findSystemBrowser() {
  const home = os.homedir()
  const list =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge'
          ]
  for (const p of list) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* 忽略 */
    }
  }
  return ''
}

/**
 * 给渲染后端补上系统浏览器路径。
 * getRenderer() 默认返回 loader 本身，真正的后端在 script_renderers / noscript_renderers 里，
 * 所以三种结构都覆盖。只改内存里的实例，不动框架文件与配置。
 */
function patchBrowser(renderer, browser) {
  let patched = false
  const seen = new Set()
  const visit = node => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    const conf = node.config
    if (conf && typeof conf === 'object' && !conf.executablePath && !conf.wsEndpoint) {
      conf.executablePath = browser
      node.browser = false
      patched = true
    }
    for (const key of ['script_renderers', 'noscript_renderers']) {
      if (Array.isArray(node[key])) node[key].forEach(visit)
    }
    if (node.renderers instanceof Map) for (const v of node.renderers.values()) visit(v)
  }
  visit(renderer)
  return patched
}

const dataUriCache = new Map()

/** file:// 图片转 data URI（外置服务是 setContent 注入，file:// 会被浏览器拦掉） */
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

/** 外置渲染服务（如 pupu）：POST {url}/render，失败返回 null 由调用方回退 */
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

/** 包成图片消息段。云崽标准写法（lib/puppeteer/puppeteer.js 也是这么包的）：
 *  裸 Buffer 会被 StringOrBuffer() 当成纯数据转成 base64:// 内嵌，图一大就发不出去；
 *  包成 image 段后由适配器走 fileType()，超过阈值会自动落盘转 file:// 走上传通道。 */
function toImage(img) {
  if (!img) return null
  try {
    if (typeof segment !== 'undefined' && typeof segment?.image === 'function') return segment.image(img)
  } catch {
    /* 忽略 */
  }
  return img
}

export async function renderTo(tplFile, name, data) {
  if (!fs.existsSync(tplFile)) {
    log('error', `模板不存在：${tplFile}`)
    return null
  }

  const tplData = {
    versionHtml: versionHtml(),
    ...data
  }

  // 用外置渲染服务（url 留空 = 不启用）
  if (CONFIG.renderServer?.enable && CONFIG.renderServer.url && Date.now() > rsDownUntil) {
    const img = await renderViaServer(tplFile, tplData)
    if (img) {
      rsDownUntil = 0
      return toImage(img)
    }
    rsDownUntil = Date.now() + 60 * 1000
    log('warn', `外置渲染服务不可用，已回退云崽渲染器（${name}）`)
  }

  let loader
  try {
    loader = (await import('../../../lib/renderer/loader.js')).default
  } catch (err) {
    log('error', `渲染器加载失败（${name}）：${err?.message ?? err}`)
    return null
  }

  const payload = {
    tplFile,
    saveId: `${name}-${Date.now()}`,
    quality: CONFIG.jpegQuality,
    ...tplData
  }

  // 用 loader 自身渲染：它会按顺序遍历所有渲染后端（含 puppeteer_ws / 外置渲染服务等），
  // 失败一个会接着试下一个；getRenderer() 只返回单个后端，失败就没得 fallback。
  const shot = async () => {
    try {
      return (await loader.render(name, payload)) || null
    } catch (err) {
      log('warn', `渲染异常（${name}）：${err?.message ?? err}`)
      return null
    }
  }

  let img = await shot()

  // 全都失败时，再给后端补一个系统浏览器路径重试一次
  // （老版 puppeteer 找不到自带 Chromium 会直接失败，不会回退系统浏览器）
  if (!img) {
    const browser = findSystemBrowser()
    if (browser && patchBrowser(loader, browser)) {
      log('mark', `渲染失败，改用系统浏览器重试：${browser}`)
      img = await shot()
    }
  }

  if (!img) {
    log('error', `渲染返回空：${name}`)
    return null
  }
  return toImage(img)
}
