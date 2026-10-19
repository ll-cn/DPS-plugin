import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { log } from './log.js'
import { versionHtml } from './version.js'
import { CONFIG } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const RES_DIR = path.join(__dirname, '..', 'resources')
export const TPL_TEAMS = path.join(RES_DIR, 'teams.html')
export const TPL_WEIZHAN = path.join(RES_DIR, 'weizhan.html')
export const TPL_HELP = path.join(RES_DIR, 'help.html')

export const PLUGIN_ROOT = path.dirname(RES_DIR)
export const PLUGIN_DIR_NAME = path.basename(PLUGIN_ROOT)

/** 图片资源的 file:// 地址（模板里直接当 src 用） */
function resUrl(name) {
  const p = path.join(RES_DIR, name)
  try {
    return fs.existsSync(p) ? pathToFileURL(p).href : ''
  } catch {
    return ''
  }
}

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

/** 给渲染后端补上系统浏览器路径（只改内存实例，不动框架文件与配置） */
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

/** 包成图片消息段。裸 Buffer 会被 StringOrBuffer() 转成 base64:// 内嵌，图一大就发不出去；
 *  包成 image 段后适配器走 fileType()，超阈值自动落盘转 file:// 走上传通道。
 *  （部分云崽的 puppeteer.screenshot() 已经包好了段，这里不重复包） */
function toImage(img) {
  if (!img) return null
  if (!Buffer.isBuffer(img) && !(img instanceof Uint8Array) && typeof img !== 'string') return img
  try {
    if (typeof segment !== 'undefined' && typeof segment?.image === 'function') return segment.image(img)
  } catch {
    /* 忽略 */
  }
  return img
}

/**
 * 收集可用的渲染入口。不同分支/版本的云崽入口不一样，逐个试：
 *  ① lib/puppeteer/puppeteer.js —— 生态通用入口，miao / genshin / ji 等几十个插件都用它，兼容性最好
 *  ② lib/renderer/loader.js 的 render —— TRSS 新版入口，会遍历所有渲染后端
 *  ③ loader.getRenderer() —— 指定了 renderer.yaml 的 name 时，直接问那个后端
 */
async function loadRenderTargets() {
  const targets = []
  const seen = new Set()
  const add = (label, target, key) => {
    if (!target || seen.has(key)) return
    seen.add(key)
    const call =
      typeof target.screenshot === 'function'
        ? (n, p) => target.screenshot(n, p)
        : typeof target.render === 'function'
          ? (n, p) => target.render(n, p)
          : null
    if (call) targets.push({ label, target, call })
  }

  try {
    const d = (await import('../../../lib/puppeteer/puppeteer.js')).default
    add('puppeteer', d, d)
  } catch (err) {
    log('warn', `puppeteer 入口不可用：${err?.message ?? err}`)
  }

  try {
    const loader = (await import('../../../lib/renderer/loader.js')).default
    add('loader.render', loader?.render ? loader : null, loader)
    const one = loader?.getRenderer?.()
    add(`getRenderer(${one?.id ?? '?'})`, one && one !== loader ? one : null, one)
  } catch (err) {
    log('warn', `渲染器加载失败：${err?.message ?? err}`)
  }

  return targets
}

export async function renderTo(tplFile, name, data) {
  if (!fs.existsSync(tplFile)) {
    log('error', `模板不存在：${tplFile}`)
    return null
  }

  const payload = {
    tplFile,
    saveId: `${name}-${Date.now()}`,
    quality: CONFIG.jpegQuality,
    cssZoom: CONFIG.imageScale,
    badgeRed: resUrl('badge-red.png'),
    badgeGreen: resUrl('badge-green.png'),
    badgeGk: resUrl('badge-gk.png'),
    badgeLv: resUrl('badge-lv.png'),
    versionHtml: versionHtml(),
    ...data
  }

  const targets = await loadRenderTargets()
  if (!targets.length) {
    log('error', `没有可用的渲染入口（${name}）`)
    return null
  }

  const shot = async t => {
    try {
      return (await t.call(name, payload)) || null
    } catch (err) {
      log('warn', `渲染异常（${name} / ${t.label}）：${err?.message ?? err}`)
      return null
    }
  }

  for (const t of targets) {
    let img = await shot(t)
    if (!img) {
      // 失败时给后端补一个系统浏览器路径重试一次
      // （老版 puppeteer 找不到自带 Chromium 会直接失败，不会回退系统浏览器）
      const browser = findSystemBrowser()
      if (browser && patchBrowser(t.target, browser)) {
        log('mark', `渲染失败，改用系统浏览器重试：${browser}（${t.label}）`)
        img = await shot(t)
      }
    }
    if (img) return toImage(img)
    log('warn', `渲染入口 ${t.label} 未出图（${name}）`)
  }

  log('error', `渲染返回空：${name}`)
  return null
}
