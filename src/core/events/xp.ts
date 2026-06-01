import type { WASocket } from '@whiskeysockets/baileys'
import { getUserData, userData } from './index.js'

const XP_PER_MSG  = () => Math.ceil(Math.random() * 10) + 5
const XP_FOR_LEVEL = (level: number) => Math.floor(100 * Math.pow(1.5, level))

export function addXP(
  sock:     WASocket,
  jid:      string,
  sender:   string,
  pushName: string,
): void {
  const user   = getUserData(sender, pushName)
  user.exp    += XP_PER_MSG()
  user.name    = pushName || user.name

  const needed = XP_FOR_LEVEL(user.level)
  if (user.exp >= needed) {
    user.exp   -= needed
    user.level += 1
    userData.set(sender, user)

    const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
    sock.sendMessage(jid, {
      text:     `◆ @${num} subio al nivel *${user.level}*!`,
      mentions: [sender],
    }).catch(() => {})
    return
  }

  userData.set(sender, user)
}

export function getXPInfo(sender: string): { exp: number; level: number; needed: number; progress: number } {
  const user   = getUserData(sender)
  const needed = XP_FOR_LEVEL(user.level)
  const pct    = Math.floor((user.exp / needed) * 100)
  return { exp: user.exp, level: user.level, needed, progress: pct }
}