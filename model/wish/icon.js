import fs from 'node:fs'
import path from 'node:path'
import { ICON_DIR } from './paths.js'
import { log } from '../log.js'

const HOSTS = ['https://enka.network/ui', 'https://gi.yatta.moe/assets/UI']

const mem = new Map()
const pending = new Map()
let active = 0
const MAX_ACTIVE = 6

function localPath(icon) {
  return path.join(ICON_DIR, `${icon}.png`)
}

async function download(icon) {
  const target = localPath(icon)
  if (fs.existsSync(target) && fs.statSync(target).size > 1024) return target
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/${icon}.png`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12000)
      })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 1024) continue
      fs.mkdirSync(ICON_DIR, { recursive: true })
      fs.writeFileSync(target, buf)
      return target
    } catch {
      /* 换下一个源 */
    }
  }
  return ''
}

/**
 * 取图标：优先本地缓存，缺失时下载一次。
 * 返回可直接放进 <img src> 的地址（本地 file:// 或远端 http）。
 */
export async function iconSrc(icon) {
  if (!icon) return ''
  if (mem.has(icon)) return mem.get(icon)
  if (pending.has(icon)) return pending.get(icon)

  const job = (async () => {
    let src = ''
    if (active < MAX_ACTIVE) {
      active += 1
      try {
        const file = await download(icon)
        if (file) src = `file:///${file.replace(/\\/g, '/')}`
      } finally {
        active -= 1
      }
    }
    if (!src) src = `${HOSTS[0]}/${icon}.png`
    mem.set(icon, src)
    pending.delete(icon)
    return src
  })()

  pending.set(icon, job)
  return job
}

/** 批量取图标，返回 { icon: src } */
export async function iconMap(icons) {
  const list = [...new Set((icons || []).filter(Boolean))]
  const out = {}
  const results = await Promise.allSettled(list.map(i => iconSrc(i)))
  list.forEach((icon, i) => {
    out[icon] = results[i].status === 'fulfilled' ? results[i].value : `${HOSTS[0]}/${icon}.png`
  })
  return out
}

/** 已缓存图标数量 */
export function cachedCount() {
  try {
    return fs.readdirSync(ICON_DIR).filter(f => f.endsWith('.png')).length
  } catch {
    return 0
  }
}

/** 清理单个图标缓存（元数据更新后可让新旧图标重新拉取） */
export function dropIcon(icon) {
  mem.delete(icon)
  try {
    fs.rmSync(localPath(icon), { force: true })
  } catch (err) {
    log('warn', `删除图标缓存失败：${err?.message ?? err}`)
  }
}
