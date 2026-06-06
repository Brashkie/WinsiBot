import type { Command }    from '../../../types/index.js'
import type { WAMessage }  from '@whiskeysockets/baileys'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { safeSend }             from '@lib/media_sender.js'

const command: Command = {
  name:        'setpp',
  aliases:     ['setppbot', 'fotobot', 'cambiafoto'],
  description: 'Cambia la foto de perfil del bot',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg }) {
    const ctx     = msg.message?.extendedTextMessage?.contextInfo
    const imgMsg  = ctx?.quotedMessage?.imageMessage
               ?? msg.message?.imageMessage
               ?? null

    if (!imgMsg) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '§ Envía o cita una imagen para usarla como foto de perfil',
      }, { quoted: msg }))
      return
    }

    // Construir WAMessage con la imagen correcta para descargar
    const dlMsg: WAMessage = imgMsg === msg.message?.imageMessage
      ? msg
      : {
          key: {
            remoteJid: jid,
            fromMe:    false,
            id:        ctx?.stanzaId ?? '',
            ...(ctx?.participant != null && { participant: ctx.participant }),
          },
          message: ctx!.quotedMessage!,
        }

    const buffer = await downloadMediaMessage(dlMsg, 'buffer', {}).catch(() => null)

    if (!buffer) {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ No se pudo descargar la imagen',
      }, { quoted: msg }))
      return
    }

    await sock.updateProfilePicture(sock.user!.id, buffer as Buffer)

    await safeSend(() => sock.sendMessage(jid, {
      text: '✔ Foto de perfil actualizada',
    }, { quoted: msg }))
  },
}

export default command
