import { STANDARD5, WEAPON3, allChar4, allWeapon3, allWeapon4, findChar, findWeapon } from './meta.js'
import { POOLS } from './banner.js'

/** 各池概率参数：base 基础概率，soft 起提抽数，hard 硬保底，step 每抽增幅，upRate UP 占比 */
const RULES = {
  char1: { base: 0.006, soft: 74, hard: 90, step: 0.06, upRate: 0.5, base4: 0.051 },
  char2: { base: 0.006, soft: 74, hard: 90, step: 0.06, upRate: 0.5, base4: 0.051 },
  weapon: { base: 0.007, soft: 63, hard: 80, step: 0.07, upRate: 0.75, base4: 0.06 },
  standard: { base: 0.006, soft: 74, hard: 90, step: 0.06, upRate: 0, base4: 0.051 }
}

/** 池子初始计数 */
export const POOL_INIT = {
  char1: { p5: 0, p4: 0, g5: false, g4: false, total: 0, star5: 0, miss5: 0 },
  char2: { p5: 0, p4: 0, g5: false, g4: false, total: 0, star5: 0, miss5: 0 },
  weapon: { p5: 0, p4: 0, g5: false, g4: false, fate: 0, picked: '', total: 0, star5: 0, miss5: 0 },
  standard: { p5: 0, p4: 0, total: 0, star5: 0 }
}

export function isWeaponPool(poolId) {
  return poolId === 'weapon'
}

/** 该抽的五星概率 */
function rate5(poolId, pity) {
  const r = RULES[poolId] || RULES.char1
  if (pity >= r.hard) return 1
  const over = pity - (r.soft - 1)
  if (over <= 0) return r.base
  return Math.min(1, r.base + over * r.step)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 角色池的五星产出（含大小保底） */
function rollChar5(banner, state) {
  const pool = banner.up5.length ? banner.up5 : []
  const std = STANDARD5.map(n => findChar(n))
  const guaranteed = state.g5 === true

  if (pool.length && (guaranteed || Math.random() < RULES.char1.upRate)) {
    const hit = pick(pool)
    state.g5 = false
    return { ...hit, rank: 5, isUp: true }
  }

  const hit = std.length ? pick(std) : pool[0]
  state.g5 = pool.length > 0
  if (pool.length) state.miss5 = (Number(state.miss5) || 0) + 1
  return { ...hit, rank: 5, isUp: false }
}

/** 武器池的五星产出（含定轨） */
function rollWeapon5(banner, state) {
  const upList = (banner.up5Weapon || []).filter(Boolean)
  const picked = state.picked && upList.some(w => w.name === state.picked) ? state.picked : ''
  const stdWeapon = ['苍古自由之誓', '天空之刃', '天空之翼', '天空之卷', '天空之傲', '天空之脊', '狼的末路', '阿莫斯之弓']
  const std = stdWeapon.map(n => findWeapon(n))

  if (picked && (Number(state.fate) || 0) >= 2) {
    const hit = upList.find(w => w.name === picked)
    state.fate = 0
    state.g5 = false
    return { ...hit, rank: 5, isUp: true }
  }

  if (upList.length && Math.random() < RULES.weapon.upRate) {
    const hit = picked && Math.random() < 0.5 ? upList.find(w => w.name === picked) : pick(upList)
    if (picked && hit.name === picked) state.fate = 0
    else state.fate = Math.min(2, (Number(state.fate) || 0) + 1)
    state.g5 = false
    return { ...hit, rank: 5, isUp: true }
  }

  const hit = pick(std)
  state.fate = Math.min(2, (Number(state.fate) || 0) + 1)
  state.miss5 = (Number(state.miss5) || 0) + 1
  state.g5 = false
  return { ...hit, rank: 5, isUp: false }
}

/** 四星产出 */
function roll4(poolId, banner, state) {
  const guaranteed = state.g4 === true
  if (poolId === 'weapon') {
    const up = (banner.up4Weapon || []).filter(Boolean)
    if (up.length && (guaranteed || Math.random() < 0.75)) {
      state.g4 = false
      return { ...pick(up), rank: 4, isUp: true }
    }
    state.g4 = up.length > 0
    return { ...findWeapon(pick(allWeapon4())), rank: 4, isUp: false }
  }

  const up = poolId === 'standard' ? [] : (banner.up4 || []).filter(Boolean)
  if (up.length && (guaranteed || Math.random() < 0.5)) {
    state.g4 = false
    return { ...pick(up), rank: 4, isUp: true }
  }
  state.g4 = up.length > 0
  return { ...findChar(pick(allChar4())), rank: 4, isUp: false }
}

/** 三星武器名池（首次使用时从元数据里取，取不到用内置名单） */
let w3Cache = null
function weapons3() {
  if (!w3Cache || !w3Cache.length) {
    const list = allWeapon3()
    w3Cache = list.length ? list : WEAPON3
  }
  return w3Cache
}

/** 三星垫底 */
function roll3() {
  const name = pick(weapons3())
  const w = findWeapon(name)
  return { name, rank: 3, isUp: false, icon: w.icon || '', type: w.type || '武器', element: '' }
}

/**
 * 抽一次，直接修改 state。
 * 返回 { rank, name, icon, element, type, isUp, pity }
 */
export function rollOnce(poolId, banner, state) {
  const r = RULES[poolId] || RULES.char1
  state.p5 = (Number(state.p5) || 0) + 1
  state.p4 = (Number(state.p4) || 0) + 1
  state.total = (Number(state.total) || 0) + 1

  const pity = state.p5
  if (pity >= r.hard || Math.random() < rate5(poolId, pity)) {
    const hit = poolId === 'weapon' ? rollWeapon5(banner, state) : poolId === 'standard'
      ? { ...findChar(pick(STANDARD5)), rank: 5, isUp: false }
      : rollChar5(banner, state)
    state.p5 = 0
    state.star5 = (Number(state.star5) || 0) + 1
    return { ...hit, rank: 5, pity, pool: poolId }
  }

  if (state.p4 >= 10 || Math.random() < r.base4) {
    const hit = roll4(poolId, banner, state)
    state.p4 = 0
    return { ...hit, rank: 4, pity: state.p5, pool: poolId }
  }

  return { ...roll3(), pity: state.p5, pool: poolId }
}

/** 连抽 count 次 */
export function rollMany(poolId, banner, state, count) {
  const out = []
  for (let i = 0; i < count; i += 1) out.push(rollOnce(poolId, banner, state))
  return out
}

/** 卡片标题用的池子名 */
export function poolTitle(poolId, banner) {
  const meta = POOLS[poolId] || POOLS.char1
  const name = banner?.name ? `「${banner.name}」` : ''
  return `${name}${meta.short}`
}

/** 池子里 UP 名单的简短展示 */
export function upNames(poolId, banner) {
  if (!banner) return ''
  if (poolId === 'weapon') return (banner.up5Weapon || []).map(w => w.name).filter(Boolean).join(' / ')
  if (poolId === 'standard') return '无 UP'
  return (banner.up5 || []).map(c => c.name).filter(Boolean).join(' / ')
}
