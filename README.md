# 原神 DPS · 危战 榜单插件

Yunzai / TRSS-Yunzai 插件：原神配队 **DPS 榜** + **危战榜**，图片渲染。

数据来源：[mhydps.cn](https://www.mhydps.cn/)

## 特性

- 🖼 **图片渲染**：角色圆形头像、命座角标、金数、伤害/用时、B站视频入口
- 📊 **DPS 配队榜**：按角色查，支持翻页、金数上限筛选
- ⚔️ **危战榜**：按 boss 查，支持版本筛选（5.7 ~ 7.1）与低金筛选
- 👥 **头像复用 miao-plugin 本地图库**，不需要联网取头像
- ⏱ **5 分钟缓存**，避免频繁请求被 Cloudflare 拦

## 安装

### 前置条件

- 渲染后端：`puppeteer` 或 `shotium`（TRSS-Yunzai 自带）
- 建议安装 [miao-plugin](https://github.com/yoimiya-kokomi/miao-plugin) —— 提供角色头像。
  没装也能用，只是头像位置显示角色首字。

### 方式一：手动克隆（推荐，最稳）

在 **Yunzai 根目录**执行：

```bash
git clone https://github.com/ll-cn/DPS-plugin.git plugins/DPS-plugin
```

然后重启机器人。

### 方式二：机器人指令安装

装有 **earth-k-plugin**：

```
#安装插件 https://github.com/ll-cn/DPS-plugin.git
```

装有 **AQing-plugin**：

```
#阿晴安装插件 https://github.com/ll-cn/DPS-plugin.git
```

### ⚠️ 必须克隆整个仓库

插件依赖 `resources/` 下的 3 个 html 模板，**只放 `app/` 里的 js 是跑不出图的**
（机器人会回复「缺少模板文件」并告诉你缺哪一个）。

另外 `index.js` 是入口 —— 云崽的加载规则是「有 `index.js` 就只加载它」，
所以**不要删掉或改名 `index.js`**，否则插件不会被加载。

## 配置

配置文件：**`config/config.yaml`**，改完保存**即时生效**（不用重启）。

```yaml
cacheTime: 300000   # 数据缓存时长(毫秒)，官方建议 ≥5 分钟
timeout: 25000      # 请求超时(毫秒)
perPage: 5          # 每页条数
maxPage: 30         # 最多翻到第几页
lowCost: 2          # 危战「低金」的金数上限
alias:              # 角色俗称 → 官方名
  少女: 哥伦比亚
  火神: 玛薇卡
```

## 指令

| 指令 | 说明 |
| --- | --- |
| `#dps帮助` | 查看全部指令（图片） |
| `#dps配队 <角色> [页数]` | 该角色的 DPS 配队榜，每页 5 条 |
| `#dps配队 <角色> N金` | 只看金数 ≤N 的配队 |
| `#dps危战` | 最新版本（7.1）的危战榜 |
| `#dps危战 <boss>` | 指定 boss，如 `#dps危战 游雪的护刃` |
| `#dps危战 <boss> 低金` | 只看低金配队（金数 ≤2） |
| `#dps危战 <版本号>` | 列出某版本的 boss，如 `#dps危战 7.0` |
| `#dps危战列表 [版本]` | 全部 boss（可按版本筛），带各 boss 条数 |
| `#dps视频 <名次>` | 取榜单第 N 条的 B 站视频链接 |
| `#dps刷新` | 重新拉取榜单数据（仅主人） |
| `#dps更新` | 更新插件版本（从 GitHub 拉取，仅主人） |

`#危战` 可作为 `#dps危战` 的简写。图片右下角会显示云崽版本与插件版本号。

### 更新插件

发 `#dps更新` 即可自动从 GitHub 拉取最新代码（仅主人可用）。

- 要求插件是**用 `git clone` 安装的**；手动复制文件的装法没法自动更新，
  这时机器人会回复重装命令。
- 更新完成后**需要重启机器人**才会生效（插件入口是 `index.js`，不参与热重载）。
- 如果网络连不上 GitHub，先在 git 里配好代理：
  `git config --global http.proxy http://127.0.0.1:端口`（`https.proxy` 同值）。

### 几个说明

- **排名口径不同**：DPS 榜按**伤害**降序；危战榜按**通关秒数**升序（越快越靠前）。
- **重名 boss 消歧**：同一个 boss 名可能出现在多个版本（如「水形幻人」在 6.6 和 5.7）。
  不带版本号默认取最新版；写了版本号（`#dps危战 5.7 水形幻人`）则精确命中该版本。
- **角色俗称**：在 `config/config.yaml` 的 `alias` 里加，改完即时生效。
- **缓存时长 / 每页条数**：都在 `config/config.yaml` 里调整。

## 依赖说明

插件本身**没有任何 npm 依赖**（只用 Node 内置模块 + 云崽自带的 `yaml`），
所以仓库里没有 `package.json`，安装时也不需要 `pnpm install`。

需要 Node.js **≥ 18**（用到全局 `fetch` 与 `AbortController`）。

## 免责声明

数据来自第三方站点 [mhydps.cn](https://www.mhydps.cn/)，本插件仅做展示，
不存储、不修改任何数据，仅供学习交流使用。

## License

MIT
