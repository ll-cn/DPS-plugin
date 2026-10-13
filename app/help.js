import plugin from '../../../lib/plugins/plugin.js'
import { CONFIG, loadConfig } from '../model/config.js'
import { LATEST_VER } from '../model/boss.js'
import { TPL_HELP, renderTo, renderFailBrief } from '../model/render.js'
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

    const img = await renderTo(TPL_HELP, 'dps-plugin-help', {
      dps: [
        { cmd: '#dps配队 <角色>', desc: '该角色的配队DPS榜（按伤害），每页 5 条' },
        { cmd: '#dps配队 <角色> 2', desc: '看第 2 页' },
        { cmd: '#dps配队 <角色> 5金', desc: '只看金数 ≤5 的配队' }
      ],
      wz: [
        { cmd: '#dps危战', desc: '最新版本的危战榜（按通关秒数，越快越靠前）' },
        { cmd: '#dps危战 <boss>', desc: '指定 boss，如 #dps危战 游雪的护刃' },
        { cmd: '#dps危战 <boss> 低金', desc: '只看低金配队（金数 ≤2）' },
        { cmd: '#dps危战 <版本号>', desc: '看某版本的 boss，如 #dps危战 7.0（5.7~7.1 都能查）' },
        { cmd: '#dps危战列表 [版本]', desc: '列出 boss（可按版本筛），带各 boss 条数' }
      ],
      common: [
        { cmd: '#dps视频 <序号>', desc: '取榜单第 N 条的 B 站视频链接' },
        { cmd: '#dps刷新', desc: '重新拉取榜单数据（仅主人）' },
        { cmd: '#dps更新', desc: '更新插件版本（从 GitHub 拉取，仅主人）' },
        { cmd: '#dps强制更新', desc: '更新失败时用它，丢弃本地改动强拉最新（仅主人）' }
      ],
      perPage: CONFIG.perPage,
      cacheMin: Math.round(CONFIG.cacheTime / 60000),
      latestVer: LATEST_VER
    })

    // 渲染失败 → 纯文本兜底（附一行原因）
    await e.reply(img || [this.helpText(), '', `（${renderFailBrief()}）`].join('\n'))
    return true
  }

  helpText() {
    return [
      '【原神DPS】数据源 mhydps.cn',
      '━━━━━━━━━━━━━━',
      '#dps配队 <角色> [页数]   DPS配队榜',
      '#dps配队 <角色> N金     只看金数 ≤N',
      '#dps危战 [boss|版本]    危战榜（按秒数）',
      '#dps危战 <boss> 低金    只看低金',
      '#dps危战列表 [版本]     列出 boss',
      '#dps视频 <序号>         取该名次视频',
      '#dps刷新                刷新榜单数据（仅主人）',
      '#dps更新                更新插件版本（仅主人）',
      '#dps强制更新            更新失败时用，丢弃本地改动强拉（仅主人）',
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
