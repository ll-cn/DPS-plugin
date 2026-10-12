/** 名次配色：前三红/紫/蓝，后面灰 */
const RANK_COLOR = ['#e8553f', '#a06be0', '#5b7cfa']
const RANK_COLOR_DEFAULT = '#9aa8c2'

/** 伤害数字：3230000 → 323.0万 */
export function dmgText(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0'
  if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿`
  if (num >= 1e4) return `${(num / 1e4).toFixed(1)}万`
  return String(num)
}

/** 秒数：112 → 112s */
export function speedText(n) {
  const s = Number(n)
  if (!Number.isFinite(s)) return '-'
  return `${s}s`
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 是否「绿玩」：clean !== false 且不带「宏」标签 */
export function isClean(t) {
  return t?.clean !== false && !(t?.tags || []).includes('宏')
}

/** 队伍成员 → 模板用的成员数组（含头像与命座） */
function membersOf(t, chars) {
  return (t?.members || []).map(m => {
    const name = String(m?.charId ?? '?')
    const cons = Number(m?.constellation) || 0
    const info = chars.get(name)
    return {
      name,
      short: [...name][0] ?? '?',
      face: info?.face ? esc(info.face) : '',
      cons,
      consCss: cons === 0 ? 'c0' : '',
      consText: `${cons}命`
    }
  })
}

/** 金数两行 HTML：第一行总金，第二行「限X 常Y」（为 0 的省略） */
function costRowHtml(t) {
  const cost = Number(t?.cost) || 0
  const lim = Number(t?.limitcost) || 0
  const nor = Number(t?.normalcost) || 0
  const row2 = [
    lim ? `限<span class="lim">${lim}</span>` : '',
    nor ? `常<span class="nor">${nor}</span>` : ''
  ]
    .filter(Boolean)
    .join(' ')
  return {
    costHtml:
      `<div><span class="cnum">${cost}金</span></div>` +
      (row2 ? `<div class="row2">${row2}</div>` : ''),
    costText: `${cost}金`
  }
}

/**
 * DPS 榜队伍卡片
 * 金数展示照抄网站口径（总金 + 限/常），不自己算「含命星」
 */
export function toCard(t, chars, rankIdx) {
  const tags = Array.isArray(t?.tags) ? t.tags.filter(Boolean) : []
  return {
    rank: rankIdx + 1,
    rankColor: RANK_COLOR[rankIdx] || RANK_COLOR_DEFAULT,
    members: membersOf(t, chars),
    tag: tags.length ? esc(tags.join(' ')) : '',
    dmgText: dmgText(t?.damage),
    costHtml: costRowHtml(t).costHtml,
    video: !!t?.video_url,
    _raw: t
  }
}

/**
 * 危战队伍卡片
 * 榜单按 speed 升序（越快越靠前），与 DPS 榜相反
 */
export function toWeizhanCard(t, chars, rankIdx, rankNumber) {
  return {
    rank: rankNumber ?? rankIdx + 1,
    rankColor: RANK_COLOR[rankIdx] || RANK_COLOR_DEFAULT,
    members: membersOf(t, chars),
    costText: costRowHtml(t).costText,
    speedText: speedText(t?.speed),
    video: !!t?.video_url,
    cleaned: t?.clean !== false,
    _raw: t
  }
}
