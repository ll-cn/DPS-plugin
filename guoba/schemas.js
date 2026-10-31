/** 锅巴面板表单：字段名与 config/config.yaml 的键一一对应 */
export default [
  { component: 'SOFT_GROUP_BEGIN', label: '榜单数据' },
  {
    field: 'cacheTime',
    label: '数据缓存时长',
    helpMessage: '单位毫秒。官方站建议不少于 5 分钟（300000），请求太频繁容易被 Cloudflare 拦',
    component: 'InputNumber',
    componentProps: { min: 60000, max: 3600000, step: 60000, placeholder: '300000' }
  },
  {
    field: 'timeout',
    label: '请求超时',
    helpMessage: '单位毫秒，单次拉取榜单的超时时间',
    component: 'InputNumber',
    componentProps: { min: 5000, max: 60000, step: 1000, placeholder: '25000' }
  },
  {
    field: 'perPage',
    label: '每页条数',
    helpMessage: '配队榜 / 危战榜每张图显示的条数',
    component: 'InputNumber',
    componentProps: { min: 1, max: 50, step: 1, placeholder: '20' }
  },
  {
    field: 'maxPage',
    label: '最多翻到第几页',
    helpMessage: '防止翻页翻太深',
    component: 'InputNumber',
    componentProps: { min: 1, max: 100, step: 1, placeholder: '30' }
  },
  {
    field: 'lowCost',
    label: '低金上限',
    helpMessage: '指令里加「低金」时，只显示金数不超过此值的配队',
    component: 'InputNumber',
    componentProps: { min: 0, max: 10, step: 1, placeholder: '2' }
  },
  {
    field: 'aliasText',
    label: '角色俗称',
    helpMessage: '每行一条，格式「俗称: 官方名」，例如「少女: 哥伦比亚」',
    bottomHelpMessage: '留空则使用插件内置的俗称表；这里列出的会覆盖同名内置项',
    component: 'InputTextArea',
    componentProps: {
      rows: 6,
      placeholder: '少女: 哥伦比亚\n我那: 那维莱特'
    }
  },

  { component: 'SOFT_GROUP_BEGIN', label: '出图' },
  {
    field: 'imageScale',
    label: '清晰度倍数',
    helpMessage: '倍数越高字越清楚，图也越大；3 倍的榜单图约 1MB',
    component: 'Select',
    componentProps: {
      options: [
        { label: '1 倍（原尺寸，最小）', value: 1 },
        { label: '2 倍（推荐）', value: 2 },
        { label: '3 倍（最清晰，图最大）', value: 3 }
      ]
    }
  },
  {
    field: 'jpegQuality',
    label: 'JPEG 质量',
    helpMessage: '越低图越小，30 以下会明显糊',
    component: 'Slider',
    componentProps: { min: 30, max: 100, step: 1 }
  },
  {
    field: 'textOnly',
    label: '只发文字不发图',
    helpMessage: '开启后所有查询都只回文字，适合不想让机器出图的场景',
    component: 'Switch'
  },

  { component: 'SOFT_GROUP_BEGIN', label: '模拟抽卡' },
  {
    field: 'dailyLimit',
    label: '每人每天抽卡次数',
    helpMessage: '一次十连算 1 次，填 0 表示不限制',
    component: 'InputNumber',
    componentProps: { min: 0, max: 100, step: 1, placeholder: '10' }
  },
  {
    field: 'refreshMinutes',
    label: '卡池自动刷新间隔',
    helpMessage: '单位分钟。填 0 表示只在启动和卡池过期时刷新',
    bottomHelpMessage: '改完需要重启机器人才会按新间隔走，其余配置项保存即生效',
    component: 'InputNumber',
    componentProps: { min: 0, max: 1440, step: 30, placeholder: '360' }
  },
  {
    field: 'pityTip',
    label: '显示保底进度',
    helpMessage: '抽卡卡片底部是否显示还差多少抽保底',
    component: 'Switch'
  },
  {
    field: 'recallNoGold',
    label: '没出金自动撤回',
    helpMessage: '抽卡结果里没有五星时，多少秒后自动撤回；填 0 表示不撤回',
    bottomHelpMessage: '出了五星就保留不撤。撤回需要机器人是群管理员，否则只记日志',
    component: 'InputNumber',
    componentProps: { min: 0, max: 120, step: 1, placeholder: '8' }
  }
]
