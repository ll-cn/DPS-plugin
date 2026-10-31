import plugin from '../../../lib/plugins/plugin.js'
import { loadConfig, needTextOnly } from '../model/config.js'
import { POOLS } from '../model/wish/banner.js'
import { groupPlayers, getPlayer } from '../model/wish/store.js'
import { SPLIT, shortTime } from '../model/wish/format.js'
import { TPL_RECORD, renderFailBrief, renderTo } from '../model/render.js'
import { sendImage } from '../model/send.js'
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

/** 出图；失败时返回 false，由调用方回退纯文本 */
async function tryImage(e, data) {
  if (needTextOnly()) return false
  const img = await renderTo(TPL_RECORD, 'gw-record', data)
  if (!img) return false
  await sendImage(e, img)
  return true
}

export class genshinWishRecord extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: '模拟抽卡的抽卡记录、出金统计与群内排行',
      event: 'message',
      priority: 10,
      rule: [
        { reg: /^[#＃]?模拟抽卡统计/, fnc: 'stat' },
        { reg: /^[#＃]?模拟抽卡(记录|历史)/, fnc: 'record' },
        { reg: /^[#＃]?欧皇榜/, fnc: 'rank' }
      ]
    })
  }

  /** 抽卡记录：默认最近 20 条四星及以上，带「五星」只看金 */
  async record(e) {
    loadConfig()
    const player = getPlayer(e.group_id, e.user_id)
    const text = String(e.msg || '')
    const only5 = /五星|5星|金/.test(text)
    const cleaned = text.replace(/五星|5星|金/g, '')
    const page = Math.max(1, Number((cleaned.match(/\d+/) || [])[0]) || 1)

    const list = only5 ? player.stars5.slice().reverse() : player.records.slice().reverse()
    if (!list.length) {
      await e.reply(only5 ? '还没有出过五星，去抽几发吧～' : '还没有抽卡记录，发「#抽卡」开抽～')
      return true
    }

    const size = 20
    const totalPage = Math.ceil(list.length / size)
    const cur = Math.min(page, totalPage)
    const slice = list.slice((cur - 1) * size, cur * size)

    const ok = await tryImage(e, {
      mode: 'records',
      title: only5 ? '✨ 五星记录' : '📜 模拟抽卡记录',
      sub: `共 ${list.length} 条 · 第 ${cur}/${totalPage} 页`,
      right: '',
      hint: only5 ? '发「#模拟抽卡记录2」翻页' : '只看五星发「#模拟抽卡记录五星」',
      list: slice.map(item => ({
        time: shortTime(item.t),
        stars: item.rank === 5 ? '★★★★★' : '★★★★',
        starCls: item.rank === 5 ? 'r5' : 'r4',
        name: item.name,
        up: !!item.up,
        pool: POOLS[item.pool]?.short || item.pool,
        pity: only5 ? Number(item.pity) || '' : ''
      }))
    })
    if (ok) return true

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
    lines.push(only5 ? '发「#模拟抽卡记录2」翻页' : '只看五星发「#模拟抽卡记录五星」')
    await e.reply(`${lines.join('\n')}\n（${renderFailBrief()}）`)
    return true
  }

  /** 抽卡统计 */
  async stat(e) {
    loadConfig()
    const player = getPlayer(e.group_id, e.user_id)
    const { total, star5, miss } = sumPool(player)

    if (!total) {
      await e.reply('还没有抽卡记录，发「#抽卡」开抽～')
      return true
    }

    const rate = ((star5 / total) * 100).toFixed(2)
    const avg = star5 ? (total / star5).toFixed(1) : '—'
    const missRate = star5 ? ((miss / star5) * 100).toFixed(0) : ''
    const sorted = player.stars5?.slice().sort((a, b) => a.pity - b.pity) || []
    const pools = []

    for (const [id, s] of Object.entries(player.pools || {})) {
      const n = Number(s.total) || 0
      if (!n) continue
      const s5 = Number(s.star5) || 0
      pools.push({
        name: POOLS[id]?.short || id,
        total: n,
        star5: s5,
        luck: s5 ? (n / s5).toFixed(1) : '—',
        p5: Number(s.p5) || 0
      })
    }

    const ok = await tryImage(e, {
      mode: 'stat',
      title: '📊 模拟抽卡统计',
      sub: player.gid === 'private' ? '私聊' : `群 ${player.gid}`,
      right: star5 ? `歪了 ${miss} 次（${missRate}%）` : '还没出过五星',
      hint: '官方综合出金率约 1.6%',
      stats: {
        total,
        star5,
        rate,
        avg,
        has5: star5 > 0,
        best: sorted[0],
        worst: sorted[sorted.length - 1]
      },
      pools
    })
    if (ok) return true

    const lines = [
      `📊 模拟抽卡统计 · ${player.gid === 'private' ? '私聊' : `群 ${player.gid}`}`,
      SPLIT,
      `总抽数 ${total}｜五星 ${star5} 个｜出金率 ${rate}%（官方综合 1.6%）`,
      `平均 ${avg} 抽一个五星`,
      star5 ? `其中歪了 ${miss} 次，歪率 ${missRate}%` : '还没出过五星',
      SPLIT
    ]

    for (const p of pools) {
      const luck = p.star5 ? `均 ${p.luck} 抽出金` : '还没出金'
      lines.push(`${p.name}：${p.total} 抽｜${p.star5} 金｜${luck}｜已垫 ${p.p5}`)
    }

    if (star5) {
      lines.push(SPLIT)
      lines.push(`最欧：${sorted[0].name} ${sorted[0].pity} 抽`)
      lines.push(`最非：${sorted[sorted.length - 1].name} ${sorted[sorted.length - 1].pity} 抽`)
    }

    await e.reply(`${lines.join('\n')}\n（${renderFailBrief()}）`)
    return true
  }

  /** 群内欧皇榜 */
  async rank(e) {
    loadConfig()
    if (!e.isGroup) {
      await e.reply('欧皇榜只能在群里看哦～')
      return true
    }

    const players = groupPlayers(e.group_id)
      .map(p => ({ uid: p.uid, ...sumPool(p) }))
      .filter(p => p.total >= 20 && p.star5 > 0)

    if (!players.length) {
      await e.reply('本群还没有人攒够 20 抽的样本，先去抽几发吧～')
      return true
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
    const rows = ranked.map((r, i) => ({
      medal: medals[i] || '',
      no: `${i + 1}.`,
      who: names.get(String(r.uid)) || r.uid,
      avg: r.avg.toFixed(1),
      total: r.total,
      star5: r.star5
    }))

    const ok = await tryImage(e, {
      mode: 'rank',
      title: '🏆 本群欧皇榜',
      sub: '平均出金抽数越少越欧',
      right: `${ranked.length} 人上榜`,
      hint: '至少 20 抽才能上榜',
      ranks: rows
    })
    if (ok) return true

    const lines = ['🏆 本群欧皇榜 · 平均出金抽数越少越欧', SPLIT]
    rows.forEach(r => {
      lines.push(`${r.medal || r.no} ${r.who}｜${r.avg} 抽/金｜${r.total} 抽 ${r.star5} 金`)
    })
    lines.push(SPLIT)
    lines.push('至少 20 抽才能上榜')
    await e.reply(`${lines.join('\n')}\n（${renderFailBrief()}）`)
    return true
  }
}

export default genshinWishRecord
