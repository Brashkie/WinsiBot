import type { Command } from '../../../types/index.js'
import { getUserData, setUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'

// El contador vivía en Python (parquet, vía warnUser), pero `UserData` de TS
// ya tenía un campo `warns` que se persiste con el resto del usuario en
// users.aof y que no leía nadie: dos contadores para lo mismo, y el store
// "real" del bot sin usar. Mismo patrón que el bug de #ban corregido en la
// 8.7.0 — escribir en un store que la lógica del bot no consulta.
const MAX_WARNS = 3

const command: Command = {
  name: 'warn',
  aliases: ['advertir'],
  description: 'Advierte a un usuario',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ sock, jid, msg, args }) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo
    const target = quoted?.participant
      ?? args[0]?.replace('@', '') + '@s.whatsapp.net'

    if (!target) {
      await safeSend(() => sock.sendMessage(jid, { text: '❌ Menciona o cita a alguien.' }, { quoted: msg }))
      return
    }

    const user  = getUserData(target)
    const warns = user.warns + 1
    setUserData(target, { warns })

    const number = target.replace('@s.whatsapp.net', '')

    if (warns >= MAX_WARNS) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `⚠️ @${number} ha alcanzado *${warns}/${MAX_WARNS}* advertencias.\n🚫 Será expulsado.`,
        mentions: [target],
      }, { quoted: msg }))

      // kick del grupo
      await sock.groupParticipantsUpdate(jid, [target], 'remove')
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: `⚠️ @${number} advertido.\n📊 Advertencias: *${warns}/${MAX_WARNS}*`,
      mentions: [target],
    }, { quoted: msg }))
  },
}

export default command