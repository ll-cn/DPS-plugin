import fs from 'node:fs'
import path from 'node:path'

/** 插件名（显示在图片页脚、更新提示里） */
export const PLUGIN_NAME = 'DPS-plugin'

/** 插件版本号（发版时改这里，页脚会自动跟着变） */
export const VERSION = '1.0.13'

/** 仓库地址（更新日志末尾显示） */
export const REPO_URL = 'https://github.com/ll-cn/DPS-plugin.git'

/** 云崽显示名 */
const YUNZAI_NAME = 'TRSS-Yunzai'

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/** 当前运行的云崽版本（读云崽根目录 package.json 的 version） */
export function yunzaiVersion() {
  const v = readJson(path.join(process.cwd(), 'package.json')).version
  return v ? String(v) : '未知'
}

/** 纯文本版本串：TRSS-Yunzai v3.1.3 · DPS-plugin v1.0.9 */
export function versionLine() {
  return `${YUNZAI_NAME} v${yunzaiVersion()} · ${PLUGIN_NAME} v${VERSION}`
}

/** 带高亮样式的版本串（模板里用 {{@versionHtml}} 输出） */
export function versionHtml() {
  return (
    `${YUNZAI_NAME} <span class="ver">v${yunzaiVersion()}</span>` +
    ` <span class="dot">·</span> ` +
    `${PLUGIN_NAME} <span class="ver">v${VERSION}</span>`
  )
}
