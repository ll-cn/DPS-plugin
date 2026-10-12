export const LOG_TAG = '[原神DPS]'

export function log(level, msg) {
  try {
    if (globalThis.Bot?.makeLog) Bot.makeLog(level, `${LOG_TAG} ${msg}`, false)
    else logger?.[level === 'mark' ? 'info' : level]?.(`${LOG_TAG} ${msg}`)
  } catch {
    /* 日志失败不影响业务 */
  }
}
