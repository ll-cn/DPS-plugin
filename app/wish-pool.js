import plugin from '../../../lib/plugins/plugin.js'
import { bannerInfo, currentBanners, ensureFresh, getPool, leftText, POOLS, rangeText, refreshBanners } from '../model/wish/banner.js'
import { POOL_INIT } from '../model/wish/gacha.js'
import { getPlayer, poolState, touch } from '../model/wish/store.js'
import { SPLIT, buildBannerData } from '../model/wish/format.js'
import { needTextOnly } from '../model/config.js'
import { TPL_BANNER, renderTo } from '../model/render.js'
import { sendImage } from '../model/send.js'
import { PLUGIN_NAME } from '../model/version.js'

export class genshinWishPool extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: '模拟抽卡的卡池一览、武器定轨与卡池同步',
      event: 'message',
      priority: 50,
      rule: [
        { reg: /^[#＃]?卡池(更新|刷新|同步)(?=$|[\s@\[])/, fnc: 'update' },
        { reg: /^[#＃]?卡池(列表|一览)?(?=$|[\s@\[])/, fnc: 'banner' },
        { reg: /^[#＃]?定轨(?=$|[\s@\[])/, fnc: 'pick' }
      ]
    })
  }

  /** 当前卡池一览 */
  async banner(e) {
    await ensureFresh()
    const list = Object.values(currentBanners()).sort(
      (a, b) => (POOLS[a.pool]?.order || 9) - (POOLS[b.pool]?.order || 9)
    )

    if (!list.length) {
      await e.reply('还没有卡池数据，让主人发「#卡池更新」刷新一下～')
      return false
    }

    const info = bannerInfo()

    if (!needTextOnly(e)) {
      const img = await renderTo(TPL_BANNER, 'gw-banner', await buildBannerData(list, info, leftText, rangeText))
      if (img) {
        await sendImage(e, img)
        return true
      }
    }

    const lines = [`🎋 当前卡池${info.version ? ` · 版本 ${info.version}` : ''}`, SPLIT]
    for (const b of list) {
      const label = POOLS[b.pool]?.short || b.pool
      const up =
        b.pool === 'weapon'
          ? (b.up5Weapon || []).map(w => w.name).join(' / ')
          : b.pool === 'standard'
            ? '常驻角色与武器'
            : (b.up5 || []).map(c => c.name).join(' / ')
      lines.push(`【${label}】${b.name || ''}`)
      lines.push(`UP：${up || '—'}`)
      if (!b.permanent) lines.push(`${rangeText(b)}（${leftText(b)}）`)
      if (b.pool !== 'standard' && b.up4?.length) lines.push(`四星：${b.up4.map(c => c.name).join(' / ')}`)
      lines.push('')
    }

    lines.push(SPLIT)
    lines.push('抽卡：#抽卡 / #单抽 / #抽卡 武器 / #抽卡 常驻')
    await e.reply(lines.join('\n').replace(/\n+$/, ''))
    return true
  }

  /** 手动同步卡池与角色库（主人 / 群管） */
  async update(e) {
    const role = e.sender?.role || e.member?.role
    if (!e.isMaster && role !== 'owner' && role !== 'admin') {
      await e.reply('刷新卡池需要主人或群管权限哦～')
      return false
    }

    const tip = await e.reply('正在同步卡池与角色数据，稍等…')
    const r = await refreshBanners()
    const info = bannerInfo()
    const lines = [
      r.ok ? '✅ 卡池已更新' : '⚠️ 卡池更新未完成',
      SPLIT,
      `版本：${info.version || '未知'}`,
      `卡池：${(r.pools || []).map(id => POOLS[id]?.short || id).join('、') || '无变化'}`,
      r.meta
        ? `角色库：${r.meta.characters} 个｜武器库：${r.meta.weapons} 件（新增 ${r.meta.addedChar} / ${r.meta.addedWeapon}）`
        : '',
      r.errors?.length ? `问题：${r.errors.join('；')}` : ''
    ].filter(Boolean)

    try {
      if (tip && typeof e.group?.recallMsg === 'function') await e.group.recallMsg(tip.message_id)
    } catch {
      /* 撤回失败无所谓 */
    }
    await e.reply(lines.join('\n'))
    return true
  }

  /** 武器池定轨 */
  async pick(e) {
    const banner = getPool('weapon')
    if (!banner) {
      await e.reply('还没有武器池数据，稍后再试～')
      return false
    }

    const name = String(e.msg || '').replace(/^[#＃]?定轨/, '').trim()
    const upList = (banner.up5Weapon || []).map(w => w.name)

    if (!name) {
      await e.reply(
        [
          `「${banner.name || '神铸赋形'}」可定轨武器：${upList.join(' / ')}`,
          '',
          `用法：#定轨 ${upList[0] || '武器名'}`
        ].join('\n')
      )
      return false
    }

    const hit = upList.find(n => n === name || n.includes(name))
    if (!hit) {
      await e.reply(`本期武器池没有「${name}」，可选：${upList.join(' / ')}`)
      return false
    }

    const player = getPlayer(e.group_id, e.user_id)
    const state = poolState(player, 'weapon', POOL_INIT.weapon)
    state.picked = hit
    state.fate = 0
    touch()
    await e.reply(`🎯 已定轨「${hit}」\n定轨值 0/2，抽到非定轨五星时累计，满 2 后必出`)
    return true
  }
}

export default genshinWishPool
