import plugin from '../../../lib/plugins/plugin.js'
import { CONFIG, loadConfig, needTextOnly } from '../model/config.js'
import { ensureFresh, getPool, POOLS, rangeText } from '../model/wish/banner.js'
import { POOL_INIT, isWeaponPool, rollMany, upNames } from '../model/wish/gacha.js'
import { flush, getPlayer, poolState, pushRecord, pushStar5, touch } from '../model/wish/store.js'
import { buildCardData, parseArgs, pityText, poolLabel, textResult, today } from '../model/wish/format.js'
import { TPL_WISH, renderFailBrief, renderTo } from '../model/render.js'
import { sendImage } from '../model/send.js'
import { log } from '../model/log.js'
import { PLUGIN_NAME } from '../model/version.js'

/**
 * 模拟抽卡（DPS-plugin 内置）
 * priority 50 高于 genshin 自带抽卡插件的 100，保证 #抽卡 / #单抽 走这里
 */
export class genshinWish extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: '原神模拟抽卡，卡池自动跟随版本更新',
      event: 'message',
      priority: 10,
      rule: [
        { reg: /^[#＃]?单抽/, fnc: 'one' },
        { reg: /^[#＃]?(抽卡|十连|抽一次|来一发|来十连)/, fnc: 'ten' }
      ]
    })
  }

  /** 单抽 */
  async one(e) {
    return this.draw(e, 1)
  }

  /** 十连 */
  async ten(e) {
    return this.draw(e, 10)
  }

  /**
   * 抽卡主流程：校验限次 → 抽 → 落库 → 出图。
   * 触发词命中后再从消息里解析池子（武器 / 常驻 / 池2），没写就默认角色池。
   */
  async draw(e, count) {
    loadConfig()
    const word = String(e.msg || '').replace(/^[#＃]?/, '').match(/^(抽卡|十连|单抽|抽一次|来一发|来十连)/)?.[1] || ''
    const { rest, poolId } = parseArgs(e.msg, word)

    if (CONFIG.dailyLimit > 0) {
      const p0 = getPlayer(e.group_id, e.user_id)
      const day = today()
      if (p0.daily.date !== day) {
        p0.daily = { date: day, count: 0 }
        touch()
      }
      if (p0.daily.count >= CONFIG.dailyLimit) {
        await e.reply(`今天的 ${CONFIG.dailyLimit} 次抽卡机会用完啦，明天再来～`)
        return true
      }
    }

    if (isWeaponPool(poolId) && /定轨/.test(rest)) {
      await e.reply('想定轨请直接发「#定轨苍耀」这种写法，武器名写全就行')
      return true
    }

    await ensureFresh()
    const banner = getPool(poolId)

    if (!banner || (!banner.up5?.length && !banner.up5Weapon?.length && poolId !== 'standard')) {
      await e.reply(
        [
          `当前没有可用的${POOLS[poolId]?.short || '卡池'}数据。`,
          '可能卡池公告还没拉到，稍后再试；',
          '也可以让主人发「#卡池更新」手动刷新。'
        ].join('\n')
      )
      return true
    }

    const player = getPlayer(e.group_id, e.user_id)
    if (player.daily.date !== today()) player.daily = { date: today(), count: 0 }
    player.daily.count += 1

    const state = poolState(player, poolId, POOL_INIT[poolId])
    const items = rollMany(poolId, banner, state, count)

    const now = Date.now()
    for (const item of items) {
      pushRecord(player, {
        t: now,
        pool: poolId,
        rank: item.rank,
        name: item.name,
        up: !!item.isUp,
        pity: item.pity
      })
      if (item.rank === 5) {
        pushStar5(player, {
          t: now,
          pool: poolId,
          name: item.name,
          up: !!item.isUp,
          pity: item.pity,
          banner: banner.name || ''
        })
      }
    }
    touch()
    flush()

    const ctx = {
      head: poolLabel(poolId, banner),
      title: POOLS[poolId]?.label || '',
      upText: upNames(poolId, banner),
      rangeText: rangeText(banner),
      pity: CONFIG.pityTip ? pityText(poolId, state) : '',
      hint: ''
    }

    const five = items.filter(i => i.rank === 5)
    if (five.length) log('mark', `抽卡：${e.user_id} 在${POOLS[poolId]?.short}出了 ${five.map(f => f.name).join('、')}`)

    if (needTextOnly(e)) {
      await e.reply(textResult(items, ctx))
      return true
    }

    const img = await renderTo(TPL_WISH, 'gw-wish', await buildCardData(items, ctx))
    if (img) {
      await sendImage(e, img)
      return true
    }
    await e.reply(`${textResult(items, ctx)}\n（${renderFailBrief()}）`)
    return true
  }
}

export default genshinWish
