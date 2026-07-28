import type { Command } from '../../../types/index.js'
import { getUserData, TIER_LABELS, type UserTier } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'

// !settier @usuario vip   → asigna el nivel (etiqueta, ver comentario en UserTier)

const VALID_TIERS = Object.keys(TIER_LABELS) as UserTier[]

const command: Command = {
  name:        'settier',
  aliases:     ['tier', 'nivelbot'],
  description: 'Asigna el nivel de cuenta a un usuario (free/vip/premium/pro/promax)',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args }) {
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo
    const target  = ctxInfo?.mentionedJid?.[0]
      ?? ctxInfo?.participant
      ?? (args[0]?.startsWith('@') ? args[0].replace('@', '') + '@s.whatsapp.net' : null)

    const tierArg = args.find(a => (VALID_TIERS as string[]).includes(a.toLowerCase()))?.toLowerCase() as UserTier | undefined

    if (!target || !tierArg) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `§ Uso: !settier @usuario <nivel>`,
          `§ Niveles: ${VALID_TIERS.join(', ')}`,
          `§ Ejemplo: !settier @usuario vip`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const number = target.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    const user    = getUserData(target, '')
    user.tier     = tierArg

    await safeSend(() => sock.sendMessage(jid, {
      text: `✔ @${number} ahora es *${TIER_LABELS[tierArg]}*`,
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command
