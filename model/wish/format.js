import { POOLS } from './banner.js'
import { iconMap } from './icon.js'

export const SPLIT = '━━━━━━━━━━━━━━'

/** 指令里认的池子写法 → 池 id */
const POOL_WORDS = [
  [/^(武器|武器池|神铸|抽武器)/, 'weapon'],
  [/^(常驻|常驻池|奔行|标准)/, 'standard'],
  [/^(池2|角色池2|卡池2|二池|第二个)/, 'char2'],
  [/^(角色|角色池|池1|卡池1|一池)/, 'char1']
]

/** 北京时间日期 */
export function today() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** 完整时间（北京时间） */
export function fullTime(ts) {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** 简短时间（北京时间） */
export function shortTime(ts) {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** 从指令里解析池子与附加参数 */
export function parseArgs(msg, keyword) {
  const text = String(msg || '').replace(/^[#＃]?/, '')
  const rest = text.slice(keyword.length).trim()
  let poolId = 'char1'
  for (const [re, id] of POOL_WORDS) {
    if (re.test(rest)) {
      poolId = id
      break
    }
  }
  return { rest, poolId }
}

/** 「虚实临渡」角色池 这样的标题 */
export function poolLabel(poolId, banner) {
  const meta = POOLS[poolId] || POOLS.char1
  const name = banner?.name ? `「${banner.name}」` : ''
  return `${name}${meta.short}`
}

/** 当前保底状态文案 */
export function pityText(poolId, state) {
  const list = []
  if (poolId === 'weapon') {
    const fate = Number(state.fate) || 0
    list.push(state.picked ? `定轨 ${state.picked}` : '未定轨')
    if (fate > 0) list.push(`定轨值 ${fate}/2`)
  } else if (poolId !== 'standard' && state.g5) {
    list.push('大保底')
  }
  list.push(`已垫 ${Number(state.p5) || 0} 抽`)
  return list.join(' · ')
}

/** 抽卡结果的纯文本版（出图失败或 textOnly 时用） */
export function textResult(items, ctx) {
  const lines = [`🎴 ${ctx.head} · ${items.length === 1 ? '单抽' : `${items.length} 连`}`, SPLIT]
  for (const item of items) {
    const star = '★'.repeat(item.rank)
    if (item.rank >= 4) {
      const tag = item.isUp ? ' (UP)' : ''
      const el = item.element ? ` ${item.element}` : ''
      lines.push(`${star} ${item.name}${el}${tag}${item.rank === 5 ? ` · 第 ${item.pity} 抽` : ''}`)
    } else {
      lines.push(`${star} ${item.name}`)
    }
  }
  lines.push(SPLIT)
  if (ctx.pity) lines.push(ctx.pity)
  if (ctx.hint) lines.push(ctx.hint)
  return lines.join('\n')
}

/** 抽卡结果转卡片数据（图标先落地成 file:// 再交给模板） */
export async function buildCardData(items, ctx) {
  const icons = await iconMap(items.map(i => i.icon))
  return {
    title: ctx.title,
    poolLabel: ctx.head,
    upText: ctx.upText,
    rangeText: ctx.rangeText,
    pity: ctx.pity,
    items: items.map(i => ({
      name: i.name,
      rank: i.rank,
      isUp: !!i.isUp,
      element: i.element || '',
      type: i.type || '',
      star: '★'.repeat(i.rank),
      pity: i.rank === 5 ? i.pity : 0,
      src: icons[i.icon] || ''
    }))
  }
}

/** 卡池一览卡片数据 */
export async function buildBannerData(list, info, leftText, rangeText) {
  const upList = list.flatMap(b => (b.pool === 'weapon' ? b.up5Weapon : b.up5) || [])
  const icons = await iconMap(upList.map(x => x.icon))

  return {
    version: info.version || '',
    updatedText: info.updated ? `更新于 ${fullTime(info.updated)}` : '尚未同步',
    pools: list.map(b => {
      const upRaw = (b.pool === 'weapon' ? b.up5Weapon : b.up5) || []
      const limit = b.pool === 'standard' ? 3 : 4
      return {
        cls: b.pool === 'weapon' ? 'weapon' : b.pool === 'standard' ? 'standard' : '',
        label: POOLS[b.pool]?.short || b.pool,
        short: '',
        name: b.name || '',
        leftText: b.permanent ? '长期开放' : leftText(b),
        timeText: b.permanent ? '常驻角色与武器均可获取，无 UP' : `${rangeText(b)}（${leftText(b)}）`,
        more: Math.max(0, upRaw.length - limit),
        items: upRaw.slice(0, limit).map(x => ({
          name: x.name,
          rank: x.rank || 5,
          element: x.element || x.type || '',
          src: icons[x.icon] || ''
        }))
      }
    })
  }
}
