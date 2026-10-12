import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** app 目录：与本文件同级 */
const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app')

let files = []
try {
  files = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js'))
} catch (err) {
  // 目录不存在或不可读时不要把整个框架带崩，只记一条日志
  logger?.error?.(`[原神DPS] 读取 app 目录失败：${APP_DIR} —— ${err?.message ?? err}`)
}

const results = await Promise.allSettled(
  files.map(f => import(pathToFileURL(path.join(APP_DIR, f)).href))
)

const apps = {}
files.forEach((file, i) => {
  const name = file.replace(/\.js$/, '')
  const r = results[i]
  if (r.status !== 'fulfilled') {
    logger?.error?.(`[原神DPS] 载入插件失败：${file}`)
    logger?.error?.(r.reason)
    return
  }
  const mod = r.value ?? {}
  // 取默认导出，否则取第一个具名导出
  const cls = mod.default ?? mod[Object.keys(mod)[0]]
  if (typeof cls === 'function') apps[name] = cls
  else logger?.warn?.(`[原神DPS] ${file} 里没有找到插件类，已跳过`)
})

export { apps }
