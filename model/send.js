import { log } from './log.js'

/** 是否群内匿名消息（匿名发言时图片只能内嵌 base64，超过协议端单包上限就发不出去） */
export function isAnonymous(e) {
  if (!e) return false
  if (e.anonymous) return true
  if (e.sub_type === 'anonymous') return true
  return String(e.user_id ?? '') === '80000000'
}

/**
 * 发图片。
 * 匿名消息走 e.reply 会带上原消息作为引用源、可能继承匿名身份，
 * 这里对匿名消息改为直接调群对象发（不带引用源），让图片走正常上传通道；失败再回退 e.reply。
 */
export async function sendImage(e, img) {
  if (img && isAnonymous(e) && typeof e?.group?.sendMsg === 'function') {
    try {
      const res = await e.group.sendMsg(img)
      if (res) return res
      log('warn', '匿名消息直接发图未成功，回退 e.reply')
    } catch (err) {
      log('warn', `匿名消息直接发图异常：${err?.message ?? err}`)
    }
  }
  return e.reply(img)
}
