import plugin from '../../../lib/plugins/plugin.js'
import { CONFIG, loadConfig, needTextOnly } from '../model/config.js'
import { LATEST_VER } from '../model/boss.js'
import { TPL_HELP, renderTo, renderFailBrief } from '../model/render.js'
import { sendImage } from '../model/send.js'
import { versionLine } from '../model/version.js'

const PLUGIN_NAME = '原神DPS帮助'

export class genshinDpsHelp extends plugin {
  constructor() {
    super({
      name: PLUGIN_NAME,
      dsc: '原神DPS / 危战 榜单插件的帮助（图片版）',
      event: 'message',
      priority: 500,
      rule: [{ reg: /^[#＃/／]?\s*dps(帮助|说明|help)(?=$|[\s])/i, fnc: 'help' }]
    })
  }

  async help(e) {
    loadConfig()

    if (needTextOnly(e)) {
      await e.reply(this.helpText())
      return true
    }

    const img = await renderTo(TPL_HELP, 'dps-plugin-help', {
      perPage: CONFIG.perPage,
      cacheMin: Math.round(CONFIG.cacheTime / 60000),
      latestVer: LATEST_VER,
      groups: [
        {
          name: 'DPS配队榜',
          cls: 'dps',
          items: [
            { icon: '⚔️', cmd: '#dps配队 <角色>', desc: '该角色的配队榜（按伤害），每页 5 条' },
            { icon: '💰', cmd: '#dps配队 <角色> N金', desc: '只看金数 ≤N 的配队' },
            { icon: '📄', cmd: '#dps配队 <角色> <页数>', desc: '翻页看后面的名次' },
            { icon: '✨', cmd: '#dps风仙排行6金', desc: '俗称、词序都随意（风仙 = 薇斯纳）' }
          ]
        },
        {
          name: '危战榜',
          cls: 'wz',
          items: [
            { icon: '🏆', cmd: '#dps危战', desc: '最新版本危战榜（按通关秒数，越快越靠前）' },
            { icon: '👹', cmd: '#dps危战 <boss>', desc: '指定 boss，如 #dps危战 游雪的护刃' },
            { icon: '🔢', cmd: '#7.1危战第二间', desc: '按 版本号 + 第几间 查' },
            { icon: '💠', cmd: '#dps危战 <boss> 低金', desc: '只看低金配队（金数 ≤2）' }
          ]
        },
        {
          name: '更多指令',
          cls: 'more',
          items: [
            { icon: '📋', cmd: '#dps危战列表 [版本]', desc: '全部 boss 一览（带各 boss 条数）' },
            { icon: '🎬', cmd: '#dps视频 <名次>', desc: '取榜单第 N 条的 B 站视频链接' }
          ]
        },
        {
          name: '主人维护',
          cls: 'admin',
          items: [
            { icon: '🔄', cmd: '#dps刷新', desc: '重新拉取榜单数据（仅主人）' },
            { icon: '⬆️', cmd: '#dps更新', desc: '从 GitHub 更新插件版本（仅主人）' },
            { icon: '🛠️', cmd: '#dps强制更新', desc: '更新失败时用，丢弃本地改动（仅主人）' },
            { icon: '📜', cmd: '#dps更新日志', desc: '查看版本提交记录' }
          ]
        }
      ]
    })

    if (img) {
      await sendImage(e, img)
      return true
    }

    // 渲染失败 → 纯文本兜底（附一行原因）
    await e.reply([this.helpText(), '', `（${renderFailBrief()}）`].join('\n'))
    return true
  }

  helpText() {
    return [
      '【原神DPS】数据源 mhydps.cn',
      '━━━━━━━━━━━━━━',
      '#dps配队 <角色> [页数|N金]   DPS配队榜',
      '#dps风仙排行6金              俗称、词序随意',
      '#dps危战 [boss|版本]         危战榜（按秒数）',
      '#7.1危战第二间               版本号 + 第几间',
      '#dps危战 <boss> 低金         只看低金',
      '#dps危战列表 [版本]         列出 boss',
      '#dps视频 <名次>              取该名次视频',
      '#dps刷新                     刷新榜单数据（仅主人）',
      '#dps更新 / #dps强制更新      更新插件（仅主人）',
      '#dps更新日志                 查看版本提交记录',
      '━━━━━━━━━━━━━━',
      versionLine()
    ].join('\n')
  }
}

try {
  Bot.makeLog('mark', '[原神DPS] 帮助插件已加载', false)
} catch {
  /* 忽略 */
}
