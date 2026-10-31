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

/** 从 sendMsg / e.reply 的返回值里取消息 id（不同适配器结构不一样） */
export function msgIdOf(res) {
  if (!res) return null
  if (Array.isArray(res)) return msgIdOf(res[0])
  if (typeof res === 'number' || typeof res === 'string') return res
  return res.message_id ?? res.msg_id ?? res.data?.message_id ?? null
}

/**
 * 延迟撤回刚发出去的消息（撤回失败只记日志，不影响抽卡结果已落库）
 * @returns 是否真的安排了撤回
 */
export function recallLater(e, res, seconds) {
  const sec = Number(seconds)
  const id = msgIdOf(res)
  if (!id || !(sec > 0)) return false

  const timer = setTimeout(async () => {
    try {
      if (e?.group?.recallMsg) await e.group.recallMsg(id)
      else if (e?.friend?.recallMsg) await e.friend.recallMsg(id)
      else return
      log('mark', `没出金，已撤回抽卡结果（${sec} 秒）`)
    } catch (err) {
      log('warn', `撤回抽卡结果失败（多半是机器人不是管理员）：${err?.message ?? err}`)
    }
  }, sec * 1000)
  timer?.unref?.()
  return true
}
