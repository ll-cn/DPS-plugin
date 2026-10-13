import plugin from '../../../lib/plugins/plugin.js'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CONFIG, ALIAS, loadConfig, needTextOnly } from '../model/config.js'
import {
  BOSSES,
  LATEST_VER,
  LATEST_BOSSES,
  BOSS_BY_VER,
  BOSS_VER_SORTED,
  findBoss
} from '../model/boss.js'
import { caches, fetchData, fetchTeams } from '../model/api.js'
import { loadChars } from '../model/char.js'
import { toCard, toWeizhanCard, dmgText } from '../model/card.js'
import { log } from '../model/log.js'
// 注意：本文件已有 PLUGIN_NAME（插件注册名），这里给仓库名起个别名避免重名
import { PLUGIN_NAME as PKG_NAME, VERSION } from '../model/version.js'
import {
  TPL_TEAMS,
  TPL_WEIZHAN,
  PLUGIN_ROOT,
  PLUGIN_DIR_NAME,
  renderTo,
  renderFailMsg,
  renderFailBrief
} from '../model/render.js'
import { sendImage } from '../model/send.js'

const execFileAsync = promisify(execFile)

/** 正在更新中（防止并发 pull） */
let updating = false

/** 取当前 git 短提交号；不是 git 仓库时返回空串 */
async function gitShortRev() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: PLUGIN_ROOT,
      timeout: 15000
    })
    return stdout.trim()
  } catch {
    return ''
  }
}

const PLUGIN_NAME = '原神DPS'

export class genshinDps extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: '原神千星打桩 DPS 配队榜 / 危战榜（mhydps.cn），图片版',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^[#＃/／]?\s*dps(配队)?视频(?=$|[\s])/i, fnc: 'video' },
        { reg: /^[#＃/／]?\s*(dps)?危战(列表|一览|boss|全部)(?=$|[\s])/i, fnc: 'bossList' },
        { reg: /^[#＃/／]?\s*(dps)?危战(?=$|[\s])/i, fnc: 'weizhan' },
        { reg: /^[#＃/／]?\s*dps(配队|队伍榜|榜)(?=$|[\s])/i, fnc: 'teams' },
        { reg: /^[#＃/／]?\s*dps(角色|配队榜|char)(?=$|[\s])/i, fnc: 'teams' },
        { reg: /^[#＃/／]?\s*dps(刷新数据|刷新)(?=$|[\s])/i, fnc: 'refresh' },
        { reg: /^[#＃/／]?\s*dps强制更新(?=$|[\s])/i, fnc: 'forceUpdate' },
        { reg: /^[#＃/／]?\s*dps(更新|升级|update)(?=$|[\s]|数据)/i, fnc: 'update' }
      ]
    })
  }

  /* ---------------------------- 危战 ---------------------------- */

  /** 解析 `#dps危战 <boss|版本号> [页数|低金|N金]` */
  parseWeizhanArgs(e) {
    const rest = String(e?.msg ?? e?.raw_message ?? '')
      .replace(/^[#＃/／]\s*/, '')
      .replace(/^(dps)?危战/i, '')
      .trim()

    let page = 1
    let lowOnly = false
    let maxCost = null
    let bossKey = rest
    let version = null

    const tokens = rest.split(/\s+/).filter(Boolean)
    const kept = []
    for (const tk of tokens) {
      if (/^(低金|低配)$/.test(tk)) {
        lowOnly = true
        continue
      }
      const cm = tk.match(/^(\d+)\s*金$/)
      if (cm) {
        maxCost = Number.parseInt(cm[1], 10)
        continue
      }
      // 版本号：7.0 / v7.0 / 版本7.0
      const vm = tk.match(/^(?:v|版本)?\s*(\d+\.\d+)$/i)
      if (vm) {
        version = vm[1]
        continue
      }
      if (/^\d+$/.test(tk) && kept.length) {
        // boss 名之后的纯数字 → 页码
        page = Number.parseInt(tk, 10)
        continue
      }
      kept.push(tk)
    }
    bossKey = kept.join(' ').trim()

    // 版本号先校验，写了错的直接报，别静默忽略
    if (version && !BOSS_BY_VER.has(version)) {
      return { badVersion: version, versions: [...BOSS_BY_VER.keys()] }
    }

    // 只写了版本号 → 出该版本的 boss 列表
    if (version && !bossKey) {
      return { version, page, maxCost, lowOnly }
    }

    let boss = null
    if (!bossKey) {
      boss = LATEST_BOSSES[0]
    } else {
      let hits = findBoss(bossKey)
      // 同时写了版本号 → 用版本消歧（同名 boss 跨版本时很有用）
      if (version) {
        const inVer = hits.filter(b => b.ver === version)
        if (inVer.length) hits = inVer
      }
      if (!hits.length) return { notFound: bossKey }
      boss = hits[0]
    }

    if (lowOnly && maxCost === null) maxCost = CONFIG.lowCost
    if (!Number.isFinite(page) || page < 1) page = 1
    if (page > CONFIG.maxPage) page = CONFIG.maxPage

    return { boss, page, maxCost, lowOnly }
  }

  async weizhan(e) {
    loadConfig()
    const parsed = this.parseWeizhanArgs(e)

    if (parsed.badVersion) {
      await e.reply(
        `没有版本「${parsed.badVersion}」。可用版本：${parsed.versions.join('、')}\n` +
          '发 #dps危战列表 看全部 boss。'
      )
      return true
    }

    if (parsed.version) {
      await this.showBossList(e, parsed.version)
      return true
    }

    if (parsed.notFound) {
      const similar = findBoss(parsed.notFound).slice(0, 5).map(b => b.name)
      await e.reply(
        `没有找到 boss「${parsed.notFound}」。\n发 #dps危战列表 看全部 boss。` +
          (similar.length ? `\n你可能想找：${similar.join('、')}` : '')
      )
      return true
    }

    const { boss, page, maxCost, lowOnly } = parsed

    const r = await fetchData('teams2')
    if (!r.ok) {
      await e.reply(`😵 拉取危战数据失败：${r.err}\n接口有 Cloudflare 防护，稍后再试。`)
      return true
    }

    const chars = loadChars()
    let list = r.data.filter(t => Number(t?.boss) === boss.id)
    if (maxCost !== null) list = list.filter(t => (Number(t?.cost) || 0) <= maxCost)
    // 危战按秒数升序（越快越好）
    list = list.slice().sort((a, b) => (Number(a?.speed) || 9999) - (Number(b?.speed) || 9999))

    if (!list.length) {
      await e.reply(
        `「${boss.name}」（${boss.ver}）没有符合条件的数据` +
          (maxCost !== null ? `（金数 ≤ ${maxCost}）` : '') +
          '。'
      )
      return true
    }

    const total = list.length
    const totalPage = Math.max(1, Math.ceil(total / CONFIG.perPage))
    const cur = Math.min(page, totalPage)
    const start = (cur - 1) * CONFIG.perPage
    const slice = list.slice(start, start + CONFIG.perPage)

    const cards = slice.map((t, i) => toWeizhanCard(t, chars, start + i, start + i + 1))
    const costLabel = maxCost !== null ? (lowOnly ? `低金（≤${maxCost}金）` : `≤${maxCost}金`) : ''

    if (needTextOnly(e)) {
      await this.saveVideos(e, boss.name, cur, slice, 'teams2')
      const title = `危战 ${boss.name}${costLabel ? ` ${costLabel}` : ''}`
      await e.reply(this.textWeizhan(cards, title, cur, totalPage, total))
      return true
    }

    const img = await renderTo(TPL_WEIZHAN, 'dps-plugin-weizhan', {
      bossName: boss.name,
      ver: boss.ver,
      costLabel,
      total,
      page: cur,
      totalPage,
      list: cards
    })

    if (!img) {
      await e.reply(renderFailMsg())
      return true
    }

    await this.saveVideos(e, boss.name, cur, slice, 'teams2')
    await sendImage(e, img)
    return true
  }

  /**
   * 列出 boss
   *   #dps危战列表         → 全部版本
   *   #dps危战列表 7.0     → 只看该版本
   *   #dps危战 7.0         → 同上（走 weizhan 分流）
   */
  async bossList(e) {
    loadConfig()
    const rest = String(e?.msg ?? '')
      .replace(/^[#＃/／]?\s*(dps)?危战(列表|一览|boss|全部)/i, '')
      .trim()
    const vm = rest.match(/^(?:v|版本)?\s*(\d+\.\d+)$/i)
    const version = vm ? vm[1] : null
    if (version && !BOSS_BY_VER.has(version)) {
      await e.reply(`没有版本「${version}」。可用：${[...BOSS_BY_VER.keys()].join('、')}`)
      return true
    }
    await this.showBossList(e, version)
    return true
  }

  /** 渲染 boss 列表图（version 为 null 时列全部） */
  async showBossList(e, version = null) {
    // 统计每个 boss 的配队条数；拿不到就不显示数字，不影响出图
    const counts = new Map()
    let gotCounts = false
    try {
      const r = await fetchData('teams2')
      if (r.ok) {
        for (const t of r.data) {
          const id = Number(t?.boss)
          if (Number.isFinite(id)) counts.set(id, (counts.get(id) || 0) + 1)
        }
        gotCounts = true
      }
    } catch {
      /* 统计失败不阻断 */
    }

    const groups = []
    for (const [ver, arr] of BOSS_VER_SORTED()) {
      if (version && ver !== version) continue
      groups.push({
        ver,
        bosses: arr.map(b => ({
          id: b.id,
          name: b.name,
          hot: ver === LATEST_VER && b.id === LATEST_BOSSES[0].id,
          count: gotCounts ? counts.get(b.id) || 0 : ''
        }))
      })
    }

    const bossTotal = groups.reduce((n, g) => n + g.bosses.length, 0)

    const textArgs = () => [
      version ? `【危战 ${version} 版本 boss】` : '【危战 boss 列表】',
      ...groups.map(g => `【${g.ver}】${g.bosses.map(b => b.name).join('、')}`),
      '',
      '发 #dps危战 <boss名> 查看榜单'
    ]
    if (needTextOnly(e)) {
      await e.reply(textArgs().join('\n'))
      return
    }
    const img = await renderTo(TPL_WEIZHAN, 'dps-plugin-bosslist', {
      bossListMode: true,
      groups,
      latestVer: LATEST_VER,
      bossTotal,
      showCountTip: gotCounts,
      listTitle: version ? `危战 ${version} 版本 BOSS` : '危战 BOSS 一览',
      listSub: version
        ? `${bossTotal} 个 boss ｜ 发 <span class="hl">#dps危战 &lt;boss名&gt;</span> 看榜单`
        : `共 <span class="hl">${bossTotal}</span> 个 boss ｜ 跨 ${groups.length} 个版本`
    })

    if (img) {
      await sendImage(e, img)
      return
    }
    await e.reply([...textArgs(), `（${renderFailBrief()}）`].join('\n'))
  }

  /* ---------------------------- DPS 榜 ---------------------------- */

  /** DPS 榜文字版 */
  textTeams(cards, charName, maxCost, page, totalPage, total) {
    const lines = cards.map(c => {
      const raw = c._raw || {}
      const cost = Number(raw.cost) || 0
      const lim = Number(raw.limitcost) || 0
      const nor = Number(raw.normalcost) || 0
      const costTxt = nor > 0 ? `${cost}金(限${lim} 常${nor})` : lim ? `${cost}金(限${lim})` : `${cost}金`
      const tags = (raw.tags || []).filter(Boolean).join(' ')
      return (
        `${c.rank}. ${c.members.map(m => m.name).join('+')}\n` +
        `   ${c.dmgText} ｜ ${costTxt}${tags ? ` ｜ ${tags}` : ''}`
      )
    })
    return [
      `【${charName} DPS配队】第${page}/${totalPage}页 共${total}队${maxCost !== null ? `（≤${maxCost}金）` : ''}`,
      '━━━━━━━━━━━━━━',
      ...lines,
      '━━━━━━━━━━━━━━',
      page < totalPage ? `发 #dps配队 ${charName} ${page + 1} 看下一页` : '已是最后一页'
    ].join('\n')
  }

  /** 危战榜文字版 */
  textWeizhan(cards, title, page, totalPage, total) {
    const lines = cards.map(c => {
      const raw = c._raw || {}
      const cost = Number(raw.cost) || 0
      return (
        `${c.rank}. ${c.members.map(m => m.name).join('+')}\n` +
        `   ${c.speedText} ｜ ${cost}金`
      )
    })
    return [
      `【${title}】第${page}/${totalPage}页 共${total}队`,
      '━━━━━━━━━━━━━━',
      ...lines,
      '━━━━━━━━━━━━━━',
      page < totalPage ? `发 #dps危战 ${title} ${page + 1} 看下一页` : '已是最后一页'
    ].join('\n')
  }

  async teams(e) {
    loadConfig()
    const parsed = this.parseArgs(e)
    if (!parsed) return true

    const r = await fetchTeams()
    if (!r.ok) {
      await e.reply(`😵 拉取 DPS 数据失败：${r.err}\n接口有 Cloudflare 防护，稍后再试。`)
      return true
    }

    const chars = loadChars()
    const { charName, page, maxCost } = parsed

    let list = r.data.filter(t => (t?.members || []).some(m => String(m?.charId) === charName))
    if (maxCost !== null) list = list.filter(t => (Number(t?.cost) || 0) <= maxCost)
    list = list.slice().sort((a, b) => (Number(b?.damage) || 0) - (Number(a?.damage) || 0))

    if (!list.length) {
      await e.reply(
        `没有找到含「${charName}」的配队${maxCost !== null ? `（金数 ≤ ${maxCost}）` : ''}。\n` +
          '注意要用官方角色名，俗称可在 config/config.yaml 的 alias 里添加。'
      )
      return true
    }

    const total = list.length
    const totalPage = Math.max(1, Math.ceil(total / CONFIG.perPage))
    const cur = Math.min(page, totalPage)
    const slice = list.slice((cur - 1) * CONFIG.perPage, cur * CONFIG.perPage)

    const cards = slice.map((t, i) => toCard(t, chars, (cur - 1) * CONFIG.perPage + i))

    if (needTextOnly(e)) {
      await this.saveVideos(e, charName, cur, slice)
      await e.reply(this.textTeams(cards, charName, maxCost, cur, totalPage, total))
      return true
    }

    const img = await renderTo(TPL_TEAMS, 'dps-plugin-teams', {
      title: `${charName} DPS配队`,
      charName,
      costLabel: maxCost !== null ? `≤${maxCost}金` : '',
      total,
      page: cur,
      totalPage,
      list: cards,
      emptyText: '没有数据'
    })

    if (!img) {
      await e.reply(renderFailMsg())
      return true
    }

    // 记下本页序号对应的视频链接，供 #dps视频 用
    await this.saveVideos(e, charName, cur, slice)

    await sendImage(e, img)
    return true
  }

  /** 解析 `#dps配队 <角色> [页数|N金]` */
  parseArgs(e) {
    const rest = String(e?.msg ?? e?.raw_message ?? '')
      .replace(/^[#＃/／]\s*/, '')
      .replace(/^dps(配队|队伍榜|榜|角色|配队榜|char)/i, '')
      .trim()

    if (!rest) {
      e.reply('用法：#dps配队 <角色名> [页数]\n例：#dps配队 薇斯纳  或  #dps配队 玛薇卡 2')
      return null
    }

    let name = rest
    let page = 1
    let maxCost = null

    // 结尾的纯数字：可能是页码，也可能是金数上限
    const m = rest.match(/^(.*?)[\s]+(\d+)$/)
    if (m) {
      name = m[1].trim()
      const num = Number.parseInt(m[2], 10)
      if (/金/.test(m[1])) {
        maxCost = num
        name = m[1].replace(/\d+金?/g, '').trim()
      } else if (num >= 1 && num <= CONFIG.maxPage) {
        page = num
      }
    }
    // 单独的金数写法：#dps配队 薇斯纳 5金
    const cm = name.match(/^(.+?)\s*(\d+)\s*金$/)
    if (cm) {
      name = cm[1].trim()
      maxCost = Number.parseInt(cm[2], 10)
    }

    name = ALIAS[name] || name
    if (!name) {
      e.reply('用法：#dps配队 <角色名> [页数]')
      return null
    }
    return { charName: name, page, maxCost }
  }

  /* ---------------------------- 视频 ---------------------------- */

  videoKey(e) {
    return `Yz:dps-plugin:video:${e.isGroup ? e.group_id : e.user_id}`
  }

  async saveVideos(e, charName, page, slice, kind = 'teams') {
    try {
      const items = slice.map(t => ({
        url: String(t?.video_url ?? ''),
        team: (t?.members || []).map(m => m?.charId).join('+'),
        dmg: kind === 'teams2' ? `${Number(t?.speed) || 0}s` : dmgText(t?.damage),
        cost: Number(t?.cost) || 0
      }))
      await redis.set(
        this.videoKey(e),
        JSON.stringify({ charName, page, kind, items }),
        { EX: 1800 }
      )
    } catch (err) {
      logger?.warn?.(`[原神DPS] 缓存视频列表失败：${err?.message ?? err}`)
    }
  }

  async loadVideos(e) {
    try {
      const raw = await redis.get(this.videoKey(e))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async video(e) {
    const rest = String(e?.msg ?? '')
      .replace(/^[#＃/／]?\s*dps(配队)?视频/, '')
      .trim()
    const n = Number.parseInt((rest.match(/\d+/) || [])[0] ?? '', 10)
    if (!Number.isFinite(n) || n < 1) {
      await e.reply('用法：#dps视频 <序号>\n序号见榜单卡片左侧的名次。')
      return true
    }

    const last = await this.loadVideos(e)
    if (last && last.items && last.items[n - 1]) {
      const item = last.items[n - 1]
      const metric = last.kind === 'teams2' ? `用时：${item.dmg}` : `伤害：${item.dmg}`
      await e.reply(
        [
          `🎬 「${last.charName}」第 ${n} 名配队视频`,
          `队伍：${item.team}`,
          `${metric}｜${item.cost}金`,
          item.url || '（该条没有视频链接）'
        ].join('\n')
      )
      return true
    }

    await e.reply('本群还没有查过榜单，先发 #dps配队 <角色名> 或 #dps危战 <boss> 再看视频。')
    return true
  }

  /* ---------------------------- 刷新 ---------------------------- */

  async refresh(e) {
    loadConfig()
    if (!e.isMaster) {
      await e.reply('刷新数据仅限机器人主人。')
      return true
    }
    const before = caches.teams.at ? new Date(caches.teams.at).toLocaleString('zh-CN') : '（无）'
    const r1 = await fetchData('teams', true)
    const r2 = await fetchData('teams2', true)
    if (!r1.ok && !r2.ok) {
      await e.reply(`😵 刷新失败：DPS ${r1.err ?? '-'}｜危战 ${r2.err ?? '-'}`)
      return true
    }
    await e.reply(
      '✅ 榜单数据已刷新（插件版本未变，更新插件请用 #dps更新）\n' +
        `· DPS榜：${r1.ok ? `${r1.data.length} 条` : `失败（${r1.err}）`}\n` +
        `· 危战榜：${r2.ok ? `${r2.data.length} 条` : `失败（${r2.err}）`}\n` +
        `上次：${before}\n本次：${caches.teams.at ? new Date(caches.teams.at).toLocaleString('zh-CN') : '-'}`
    )
    return true
  }

  /* ---------------------------- 更新插件 ---------------------------- */

  /**
   * #dps更新 —— 从 GitHub 拉取最新代码（git pull）
   * 仅主人可用；要求插件是用 git clone 安装的
   */
  async update(e) {
    return this.pluginUpdate(e, false)
  }

  /** #dps强制更新 —— 丢弃本地改动，直接对齐远程分支（用于 pull 冲突时） */
  async forceUpdate(e) {
    return this.pluginUpdate(e, true)
  }

  /**
   * 插件更新
   * @param {boolean} force 强制模式：fetch + reset --hard（会丢弃本地改动，配置文件除外）
   */
  async pluginUpdate(e, force) {
    loadConfig()

    // 「更新数据」不是本命令的职责 —— 引导到 #dps刷新，避免两个功能混淆
    const rest = String(e?.msg ?? '')
      .replace(/^[#＃/／]?\s*dps(强制更新|更新|升级|update)/i, '')
      .trim()
    if (!force && /数据|榜单|缓存|排行/.test(rest)) {
      await e.reply(
        [
          '#dps更新 是「更新插件版本」（从 GitHub 拉取代码）。',
          '#dps刷新 才是「重新拉取榜单数据」。',
          '',
          '要刷新数据请发：#dps刷新'
        ].join('\n')
      )
      return true
    }

    if (!e.isMaster) {
      await e.reply('更新插件仅限机器人主人。')
      return true
    }
    if (updating) {
      await e.reply('正在更新中，请稍候再试。')
      return true
    }

    if (!fs.existsSync(path.join(PLUGIN_ROOT, '.git'))) {
      await e.reply(
        [
          '😵 这个插件不是用 git 克隆安装的，没法自动更新。',
          `插件目录：${PLUGIN_ROOT}`,
          '',
          '用下面的命令重装一次，之后就能用 #dps更新 了：',
          `  git clone https://github.com/ll-cn/DPS-plugin.git "${path.join('plugins', PLUGIN_DIR_NAME)}"`
        ].join('\n')
      )
      return true
    }

    updating = true
    try {
      const before = await gitShortRev()

      // 强制更新会丢弃本地改动，用户自己的配置文件先留一份
      const cfgFile = path.join(PLUGIN_ROOT, 'config', 'config.yaml')
      let cfgBackup = null
      if (force) {
        try {
          cfgBackup = fs.readFileSync(cfgFile, 'utf8')
        } catch {
          cfgBackup = null
        }
      }

      try {
        if (force) {
          const { stdout: br } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: PLUGIN_ROOT,
            timeout: 15000
          })
          const branch = br.trim() || 'main'
          await execFileAsync('git', ['fetch', '--all', '--prune'], {
            cwd: PLUGIN_ROOT,
            timeout: 60000
          })
          await execFileAsync('git', ['reset', '--hard', `origin/${branch}`], {
            cwd: PLUGIN_ROOT,
            timeout: 30000
          })
        } else {
          await execFileAsync('git', ['pull', '--ff-only'], {
            cwd: PLUGIN_ROOT,
            timeout: 60000
          })
        }
      } catch (err) {
        // 详细原因只写日志；群里回一句就好（不刷屏、也不暴露本机环境信息）
        const detail = String(err?.stderr || err?.stdout || err?.message || err).trim()
        log('error', `更新失败(${force ? '强制' : '普通'})：${detail.slice(0, 400)}｜目录 ${PLUGIN_ROOT}`)
        await e.reply(force ? '😵 强制更新失败，请查看机器人日志。' : '😵 更新失败，可试 #dps强制更新')
        return true
      }

      // 恢复用户改过的配置
      if (cfgBackup !== null) {
        try {
          fs.writeFileSync(cfgFile, cfgBackup)
        } catch {
          /* 忽略 */
        }
      }

      const after = await gitShortRev()
      // 普通模式下 commit 没变就是「已是最新」；强制模式一律报「已强制更新」
      if (!force && before && after && before === after) {
        await e.reply(`✅ 已是最新版本\n${PKG_NAME} v${VERSION}｜${after}`)
        return true
      }

      await e.reply(
        [
          force ? '✅ 已强制更新（本地改动已丢弃，配置文件已保留）' : '✅ 更新完成',
          `${before || '（未知）'} → ${after || '（未知）'}`,
          '',
          '★ 重启机器人后新版本才会生效（插件入口是 index.js，不参与热重载）。'
        ].join('\n')
      )
      return true
    } finally {
      updating = false
    }
  }
}

try {
  Bot.makeLog(
    'mark',
    `[原神DPS] 榜单插件已加载｜DPS榜 + 危战榜｜boss ${BOSSES.length} 个｜最新版本 ${LATEST_VER}`,
    false
  )
} catch {
  /* 忽略 */
}
