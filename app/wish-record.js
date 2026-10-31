import plugin from '../../../lib/plugins/plugin.js'
import { POOLS } from '../model/wish/banner.js'
import { groupPlayers, getPlayer } from '../model/wish/store.js'
import { SPLIT, shortTime } from '../model/wish/format.js'
import { PLUGIN_NAME } from '../model/version.js'

/** 某个玩家所有池子的累计抽数与五星数 */
function sumPool(player) {
  const pools = Object.values(player.pools || {})
  return {
    total: pools.reduce((a, s) => a + (Number(s.total) || 0), 0),
    star5: pools.reduce((a, s) => a + (Number(s.star5) || 0), 0),
    miss: pools.reduce((a, s) => a + (Number(s.miss5) || 0), 0)
  }
}

export class genshinWishRecord extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: '模拟抽卡的抽卡记录、出金统计与群内排行',
      event: 'message',
      priority: 50,
      rule: [
        { reg: /^[#＃]?模拟抽卡统计(?=$|[\s@\[])/, fnc: 'stat' },
        { reg: /^[#＃]?模拟抽卡(记录|历史)(?=$|[\s@\[])/, fnc: 'record' },
        { reg: /^[#＃]?欧皇榜(?=$|[\s@\[])/, fnc: 'rank' }
      ]
    })
  }

  /** 抽卡记录：默认最近 20 条四星及以上，带「五星」只看金 */
  async record(e) {
    const player = getPlayer(e.group_id, e.user_id)
    const text = String(e.msg || '')
    const only5 = /五星|5星|金/.test(text)
    const cleaned = text.replace(/五星|5星|金/g, '')
    const page = Math.max(1, Number((cleaned.match(/\d+/) || [])[0]) || 1)

    const list = only5 ? player.stars5.slice().reverse() : player.records.slice().reverse()
    if (!list.length) {
      await e.reply(only5 ? '还没有出过五星，去抽几发吧～' : '还没有抽卡记录，发「#抽卡」开抽～')
      return false
    }

    const size = 20
    const totalPage = Math.ceil(list.length / size)
    const cur = Math.min(page, totalPage)
    const slice = list.slice((cur - 1) * size, cur * size)

    const lines = only5
      ? [`✨ 五星记录 · 共 ${list.length} 个（${cur}/${totalPage} 页）`, SPLIT]
      : [`📜 模拟抽卡记录 · 共 ${list.length} 条（${cur}/${totalPage} 页）`, SPLIT]

    for (const item of slice) {
      const short = POOLS[item.pool]?.short || item.pool
      if (only5) {
        lines.push(`${shortTime(item.t)} ${item.name}${item.up ? ' UP' : ''} · ${item.pity} 抽 · ${short}`)
      } else {
        const star = item.rank === 5 ? '★★★★★' : '★★★★'
        lines.push(`${shortTime(item.t)} ${star} ${item.name}${item.up ? ' UP' : ''}`)
      }
    }

    lines.push(SPLIT)
    lines.push(only5 ? '发「#模拟抽卡记录 页码」翻页' : '只看五星发「#模拟抽卡记录 五星」')
    await e.reply(lines.join('\n'))
    return true
  }

  /** 抽卡统计 */
  async stat(e) {
    const player = getPlayer(e.group_id, e.user_id)
    const { total, star5, miss } = sumPool(player)

    if (!total) {
      await e.reply('还没有抽卡记录，发「#抽卡」开抽～')
      return false
    }

    const rate = ((star5 / total) * 100).toFixed(2)
    const avg = star5 ? (total / star5).toFixed(1) : '—'

    const lines = [
      `📊 模拟抽卡统计 · ${player.gid === 'private' ? '私聊' : `群 ${player.gid}`}`,
      SPLIT,
      `总抽数 ${total}｜五星 ${star5} 个｜出金率 ${rate}%（官方综合 1.6%）`,
      `平均 ${avg} 抽一个五星`,
      star5 ? `其中歪了 ${miss} 次，歪率 ${((miss / star5) * 100).toFixed(0)}%` : '还没出过五星',
      SPLIT
    ]

    for (const [id, s] of Object.entries(player.pools || {})) {
      const n = Number(s.total) || 0
      if (!n) continue
      const s5 = Number(s.star5) || 0
      const luck = s5 ? `均 ${(n / s5).toFixed(1)} 抽出金` : '还没出金'
      lines.push(`${POOLS[id]?.short || id}：${n} 抽｜${s5} 金｜${luck}｜已垫 ${Number(s.p5) || 0}`)
    }

    if (player.stars5?.length) {
      const best = player.stars5.slice().sort((a, b) => a.pity - b.pity)[0]
      const worst = player.stars5.slice().sort((a, b) => b.pity - a.pity)[0]
      lines.push(SPLIT)
      lines.push(`最欧：${best.name} ${best.pity} 抽`)
      lines.push(`最非：${worst.name} ${worst.pity} 抽`)
    }

    await e.reply(lines.join('\n'))
    return true
  }

  /** 群内欧皇榜 */
  async rank(e) {
    if (!e.isGroup) {
      await e.reply('欧皇榜只能在群里看哦～')
      return false
    }

    const players = groupPlayers(e.group_id)
      .map(p => ({ uid: p.uid, ...sumPool(p) }))
      .filter(p => p.total >= 20 && p.star5 > 0)

    if (!players.length) {
      await e.reply('本群还没有人攒够 20 抽的样本，先去抽几发吧～')
      return false
    }

    const ranked = players
      .map(p => ({ ...p, avg: p.total / p.star5 }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 10)

    const names = new Map()
    try {
      const map = await e.group.getMemberMap()
      for (const [uid, m] of map) names.set(String(m?.user_id ?? uid), m?.card || m?.nickname || String(uid))
    } catch {
      /* 取不到就用 QQ 号 */
    }

    const medals = ['🥇', '🥈', '🥉']
    const lines = ['🏆 本群欧皇榜 · 平均出金抽数越少越欧', SPLIT]
    ranked.forEach((r, i) => {
      const who = names.get(String(r.uid)) || r.uid
      lines.push(`${medals[i] || `${i + 1}.`} ${who}｜${r.avg.toFixed(1)} 抽/金｜${r.total} 抽 ${r.star5} 金`)
    })
    lines.push(SPLIT)
    lines.push('至少 20 抽才能上榜')
    await e.reply(lines.join('\n'))
    return true
  }
}

export default genshinWishRecord
