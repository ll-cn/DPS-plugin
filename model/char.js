import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { log } from './log.js'

/** Yunzai 根目录（渲染器等都以它为相对路径基准） */
const ROOT = process.cwd()

/** 角色头像可能存在的位置（按优先级） */
const AVATAR_DIRS = [
  path.join(ROOT, 'plugins', 'miao-plugin', 'resources', 'meta-gs', 'character'),
  path.join(ROOT, 'plugins', 'lolomi-calc', 'resources', 'meta-gs', 'character'),
  path.join(ROOT, 'data', 'miao-plugin', 'resources', 'meta-gs', 'character')
]

const CHAR_CACHE_MS = 10 * 60 * 1000
let charCache = { at: 0, map: null }

function avatarDir() {
  return (
    AVATAR_DIRS.find(d => {
      try {
        return fs.existsSync(path.join(d, 'data.json'))
      } catch {
        return false
      }
    }) || null
  )
}

/**
 * 角色资料表：中文名 → { name, face }
 * 从 miao-plugin 的 meta-gs/character 读：
 *   · data.json 给出「数字id → 中文名」
 *   · <中文名>/imgs/face.webp 是头像
 * 读不到就返回空表（头像位置退化成角色首字），不影响出图。
 */
export function loadChars() {
  const now = Date.now()
  if (charCache.map && now - charCache.at < CHAR_CACHE_MS) return charCache.map

  const map = new Map()
  const dir = avatarDir()
  if (!dir) {
    log('warn', '未找到 miao-plugin 角色数据目录，角色头像将不可用（显示首字）')
    charCache = { at: now, map }
    return map
  }

  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'))
    for (const c of Object.values(raw)) {
      const name = String(c?.name ?? '').trim()
      if (!name) continue
      const faceFile = path.join(dir, name, 'imgs', 'face.webp')
      let face = ''
      try {
        if (fs.existsSync(faceFile)) face = pathToFileURL(faceFile).href
      } catch {
        face = ''
      }
      map.set(name, { name, face, abbr: String(c?.abbr ?? name) })
    }
    log('info', `角色资料载入完成：${map.size} 个角色（来源 ${dir}）`)
  } catch (err) {
    log('error', `读取角色数据失败：${err?.message ?? err}`)
  }

  charCache = { at: now, map }
  return map
}

/** 角色别名表可能存在的位置（miao-plugin 的 meta-gs/character/alias.js） */
const ALIAS_FILES = [
  path.join(ROOT, 'plugins', 'miao-plugin', 'resources', 'meta-gs', 'character', 'alias.js'),
  path.join(ROOT, 'plugins', 'lolomi-calc', 'resources', 'meta-gs', 'character', 'alias.js'),
  path.join(ROOT, 'data', 'miao-plugin', 'resources', 'meta-gs', 'character', 'alias.js')
]

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '')

let aliasCache = null

/**
 * 角色别名表：俗称 → 正式名（如 风仙 → 薇斯纳）。
 * 直接读 miao-plugin 的 alias.js（`export const alias = { 薇斯纳: 'Vesna,威斯纳,风仙,...' }`），
 * 这样俗称不用插件自己维护；读不到就返回空表（只认正式名）。
 * @returns {Promise<Map<string,string>>}
 */
export async function loadCharAlias() {
  if (aliasCache) return aliasCache

  const map = new Map()
  for (const file of ALIAS_FILES) {
    try {
      if (!fs.existsSync(file)) continue
      const mod = await import(pathToFileURL(file).href)
      const raw = mod?.alias ?? mod?.default
      if (!raw || typeof raw !== 'object') continue
      for (const [name, aliases] of Object.entries(raw)) {
        const real = String(name).trim()
        if (!real) continue
        for (const a of String(aliases ?? '').split(',')) {
          const k = norm(a)
          if (k && !map.has(k)) map.set(k, real)
        }
      }
      if (map.size) {
        log('info', `角色别名载入：${map.size} 条（来源 ${file}）`)
        break
      }
    } catch (err) {
      log('warn', `读取角色别名失败：${err?.message ?? err}`)
    }
  }

  if (!map.size) log('warn', '未找到 miao-plugin 角色别名表，俗称将无法识别')
  aliasCache = map
  return map
}

/** 把俗称解析成正式角色名（别名表里没有就原样返回） */
export function resolveCharAlias(name, aliasMap) {
  const s = String(name ?? '').trim()
  if (!s || !aliasMap?.size) return s
  return aliasMap.get(norm(s)) || s
}
