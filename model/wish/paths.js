import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 抽卡数据目录（banners / records / meta / icons） */
export const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'wish')

export const ICON_DIR = path.join(DATA_DIR, 'icons')

/** 内置角色武器快照，随代码走，断网也能抽 */
export const STATIC_META = path.join(__dirname, 'meta-static.json')
