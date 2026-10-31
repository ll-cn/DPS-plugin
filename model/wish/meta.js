import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from '../config.js'
import { DATA_DIR, STATIC_META } from './paths.js'
import { log } from '../log.js'

const STATIC_FILE = STATIC_META
const LIVE_FILE = path.join(DATA_DIR, 'meta.json')

const API_AVATAR = 'https://gi.yatta.moe/api/v2/chs/avatar'
const API_WEAPON = 'https://gi.yatta.moe/api/v2/chs/weapon'

const ELEMENT = { Ice: '冰', Water: '水', Wind: '风', Electric: '雷', Grass: '草', Fire: '火', Rock: '岩' }
const WEAPON_TYPE = {
  WEAPON_SWORD_ONE_HAND: '单手剑',
  WEAPON_CLAYMORE: '双手剑',
  WEAPON_POLE: '长柄武器',
  WEAPON_CATALYST: '法器',
  WEAPON_BOW: '弓'
}

/** 常驻「奔行世间」五星角色（游戏内阵容，版本更新后如调整可改这里）*/
export const STANDARD5 = ['迪卢克', '琴', '莫娜', '刻晴', '七七', '提纳里', '迪希雅', '梦见月瑞希']

/** 三星武器，垫底用 */
export const WEAPON3 = [
  '冷刃', '黎明神剑', '旅行剑', '暗铁剑', '吃虎鱼刀', '飞天御剑', '沐浴龙血的剑', '以理服人',
  '铁影阔剑', '白铁大剑', '石英大剑', '白樱枪', '钺矛', '铁尖枪', '鸦羽弓', '神射手之誓',
  '弹弓', '信使', '翡玉法球', '讨龙英杰谭', '魔导绪论', '甲级宝珏'
]

let characters = {}
let weapons = {}
let updated = 0

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function apply(data) {
  if (!data) return false
  if (data.characters && typeof data.characters === 'object') characters = data.characters
  if (data.weapons && typeof data.weapons === 'object') weapons = data.weapons
  updated = Number(data.updated) || 0
  return Object.keys(characters).length > 0
}

/** 读取元数据：运行时更新的优先，缺失时用内置快照 */
export function loadMeta() {
  if (!apply(readJson(LIVE_FILE))) {
    if (!apply(readJson(STATIC_FILE))) log('warn', '角色元数据缺失，抽卡将只能显示文字')
  }
  return { characters, weapons, updated }
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(CONFIG.timeout)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * 从 yatta 拉最新角色与武器表，合并进本地。
 * 只增改不删除，保证老卡池引用的角色不会突然消失。
 */
export async function refreshMeta() {
  const next = { characters: { ...characters }, weapons: { ...weapons } }
  let addedChar = 0
  let addedWeapon = 0
  const errors = []

  try {
    const data = await getJson(API_AVATAR)
    for (const v of Object.values(data?.data?.items || {})) {
      if (!v?.name || !v?.icon) continue
      const old = next.characters[v.name]
      if (old && (old.rank || 0) >= (v.rank || 0)) continue
      if (!old) addedChar += 1
      next.characters[v.name] = {
        id: v.id,
        rank: v.rank,
        element: ELEMENT[v.element] || v.element || '',
        icon: v.icon,
        release: v.release || 0
      }
    }
  } catch (err) {
    errors.push(`角色表：${err?.message ?? err}`)
  }

  try {
    const data = await getJson(API_WEAPON)
    for (const v of Object.values(data?.data?.items || {})) {
      if (!v?.name || !v?.icon) continue
      if (!next.weapons[v.name]) addedWeapon += 1
      next.weapons[v.name] = {
        id: v.id,
        rank: v.rank,
        type: WEAPON_TYPE[v.type] || v.type || '',
        icon: v.icon
      }
    }
  } catch (err) {
    errors.push(`武器表：${err?.message ?? err}`)
  }

  if (!errors.length || Object.keys(next.characters).length > Object.keys(characters).length) {
    characters = next.characters
    weapons = next.weapons
    updated = Date.now()
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      fs.writeFileSync(LIVE_FILE, JSON.stringify({ updated, characters, weapons }), 'utf8')
    } catch (err) {
      log('warn', `角色元数据写盘失败：${err?.message ?? err}`)
    }
  }

  return {
    ok: errors.length < 2,
    characters: Object.keys(characters).length,
    weapons: Object.keys(weapons).length,
    addedChar,
    addedWeapon,
    errors
  }
}

/** 按名字查角色（公告里带的属性兜底） */
export function findChar(name, element) {
  const hit = characters[name]
  if (hit) return { name, rank: hit.rank, element: hit.element || element || '', icon: hit.icon }
  return { name, rank: 5, element: element || '', icon: '' }
}

/** 按名字查武器 */
export function findWeapon(name, type) {
  const hit = weapons[name]
  if (hit) return { name, rank: hit.rank, type: hit.type || type || '', icon: hit.icon }
  return { name, rank: 5, type: type || '', icon: '' }
}

/** 全部四星角色名（常驻池与四星池用） */
export function allChar4() {
  return Object.entries(characters).filter(([, v]) => v.rank === 4).map(([k]) => k)
}

/** 全部四星武器名（武器池四星垫底用） */
export function allWeapon4() {
  return Object.entries(weapons).filter(([, v]) => v.rank === 4).map(([k]) => k)
}

/** 全部三星武器名（垫底用） */
export function allWeapon3() {
  return Object.entries(weapons).filter(([, v]) => v.rank === 3).map(([k]) => k)
}

/** 元数据概况 */
export function metaInfo() {
  return {
    characters: Object.keys(characters).length,
    weapons: Object.keys(weapons).length,
    updated
  }
}

loadMeta()
