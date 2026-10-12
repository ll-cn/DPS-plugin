import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { log } from './log.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 插件自己的 resources 目录（放 html 模板） */
export const RES_DIR = path.join(__dirname, '..', 'resources')
export const TPL_TEAMS = path.join(RES_DIR, 'teams.html')
export const TPL_WEIZHAN = path.join(RES_DIR, 'weizhan.html')
export const TPL_HELP = path.join(RES_DIR, 'help.html')

/** 插件目录名（随克隆到的目录名变化，用于提示语） */
export const PLUGIN_DIR_NAME = path.basename(path.dirname(RES_DIR))

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

/**
 * 通用渲染
 * @param {string} tplFile 模板绝对路径
 * @param {string} name 渲染器任务名（用于 temp/html 目录与日志）
 * @param {object} data 模板数据
 * @returns {Promise<Buffer|Buffer[]|null>}
 */
export async function renderTo(tplFile, name, data) {
  try {
    if (!fs.existsSync(tplFile)) {
      log('error', `模板不存在：${tplFile}`)
      return null
    }
    const loader = (await import('../../../lib/renderer/loader.js')).default
    const renderer = loader.getRenderer()
    const img = await renderer.render(name, {
      tplFile,
      saveId: `${name}-${Date.now()}`,
      ...data
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
