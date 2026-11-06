import type { Command }    from '../../../types/index.js'
import type { WAMessage }  from '@whiskeysockets/baileys'
import { downloadMediaMessage, S_WHATSAPP_NET } from '@whiskeysockets/baileys'
import { safeSend }             from '@lib/media_sender.js'
import { convertirImagen }      from '@lib/imageApi.js'

// La foto de perfil, sin sharp (9.4.0). `sock.updateProfilePicture` la prepara
// con sharp o jimp —cuadrada de 640, JPEG calidad 50— y sin ninguno falla.
// Acá la prepara la Session API (render.rs, recortada al centro) y se manda el
// mismo pedido que arma Baileys.
async function ponerFoto(sock: any, imagen: Buffer): Promise<void> {
  const jpeg = await convertirImagen(imagen, 'jpeg', 50, { ancho: 640, alto: 640, ajuste: 'cover' })
  await sock.query({
    tag: 'iq',
    attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'w:profile:picture' },
    content: [{ tag: 'picture', attrs: { type: 'image' }, content: jpeg }],
  })
}

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

    try {
      await ponerFoto(sock, buffer as Buffer)
    } catch {
      await safeSend(() => sock.sendMessage(jid, {
        text: '✗ No se pudo cambiar la foto de perfil',
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: '✔ Foto de perfil actualizada',
    }, { quoted: msg }))
  },
}

export default command
