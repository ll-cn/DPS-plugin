/**
 * 危战 boss 表（id → 名称 / 所属版本）
 * 来源：网站前端 JS 里硬编码的 boss 列表（没有独立接口），已完整抓取。
 * 同一名称会在不同版本重复出现（如「秘源机兵统御械」），靠 id 区分。
 */
export const BOSSES = [
  { id: 713, name: '游雪的护刃', ver: '7.1' },
  { id: 712, name: '秘源机兵统御械', ver: '7.1' },
  { id: 711, name: '矮灵雕刻师', ver: '7.1' },
  { id: 703, name: '重拳出击鸭', ver: '7.0' },
  { id: 702, name: '历经百战的风役人', ver: '7.0' },
  { id: 701, name: '嵌合翼骏狮', ver: '7.0' },
  { id: 673, name: '秘源机兵构型械', ver: '6.7' },
  { id: 672, name: '深黯魇语之主', ver: '6.7' },
  { id: 671, name: '先驱秘源统辖阵列', ver: '6.7' },
  { id: 663, name: '开眼者', ver: '6.6' },
  { id: 662, name: '水形幻人', ver: '6.6' },
  { id: 661, name: '历经百战的凛狼', ver: '6.6' },
  { id: 653, name: '霜夜巡天灵主', ver: '6.5' },
  { id: 652, name: '深邃摹结株', ver: '6.5' },
  { id: 651, name: '蕴光月守宫', ver: '6.5' },
  { id: 643, name: '秘源机兵统御械', ver: '6.4' },
  { id: 642, name: '重拳出击鸭', ver: '6.4' },
  { id: 641, name: '历经百战的十六倍曼陀草', ver: '6.4' },
  { id: 633, name: '铁甲熔火帝皇', ver: '6.3' },
  { id: 632, name: '历经百战的火刃突击队员', ver: '6.3' },
  { id: 631, name: '深黯魇语之主', ver: '6.3' },
  { id: 623, name: '实验性场力发生装置', ver: '6.2' },
  { id: 622, name: '历经百战的暝视龙', ver: '6.2' },
  { id: 621, name: '深罪浸礼者', ver: '6.2' },
  { id: 613, name: '历经百战的霜役人', ver: '6.1' },
  { id: 612, name: '历经百战的执灯人', ver: '6.1' },
  { id: 611, name: '霜夜巡天灵主', ver: '6.1' },
  { id: 603, name: '历经百战的火刃突击队员', ver: '6.0' },
  { id: 602, name: '历经百战的岩居蟹', ver: '6.0' },
  { id: 601, name: '兆载永劫龙兽', ver: '6.0' },
  { id: 583, name: '历经百战的皮皮潘偶像', ver: '5.8' },
  { id: 582, name: '历经百战的玳龟', ver: '5.8' },
  { id: 581, name: '深邃摹结株', ver: '5.8' },
  { id: 573, name: '秘源机兵统御械', ver: '5.7' },
  { id: 572, name: '熔岩辉龙像', ver: '5.7' },
  { id: 571, name: '水形幻人', ver: '5.7' }
]

/** 最新版本（`#dps危战` 不带参数时用它） */
export const LATEST_VER = BOSSES[0].ver

/** 最新版本下的 boss（按 id 降序，第一个即主推 boss） */
export const LATEST_BOSSES = BOSSES.filter(b => b.ver === LATEST_VER)

/** 按版本分组（Map，插入顺序 = 版本降序） */
export const BOSS_BY_VER = (() => {
  const m = new Map()
  for (const b of BOSSES) {
    if (!m.has(b.ver)) m.set(b.ver, [])
    m.get(b.ver).push(b)
  }
  return m
})()

/** 版本降序的 [ver, bosses] 列表 */
export function BOSS_VER_SORTED() {
  return [...BOSS_BY_VER.entries()].sort((a, b) =>
    b[0].localeCompare(a[0], undefined, { numeric: true })
  )
}

/** boss 名 → 候选列表（先精确匹配、再包含匹配；同名跨版本时 id 大的在前） */
export function findBoss(keyword) {
  const kw = String(keyword ?? '').trim()
  if (!kw) return []
  const norm = s => String(s).toLowerCase().replace(/\s+/g, '')
  const k = norm(kw)
  const exact = BOSSES.filter(b => norm(b.name) === k)
  if (exact.length) return exact
  return BOSSES.filter(b => norm(b.name).includes(k))
}
