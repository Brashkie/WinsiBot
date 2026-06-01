import type { Command } from '../../../types/index.js'
import { resolveJidFull } from '@core/lid_mapper.js'

const command: Command = {
  name: 'tagone',
  aliases: ['tago', 'mention'],
  description: 'Menciona a una persona especifica',
  category: 'admin',
  groupOnly: true,

  async execute({ sock, jid, msg, args }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant

    const rawTarget = mentionRaw
      ?? quotedRaw
      ?? (args[0] ? args[0].replace('@', '') + '@s.whatsapp.net' : null)

    if (!rawTarget || rawTarget === '@s.whatsapp.net') {
      await sock.sendMessage(jid, {
        text: 'Uso: responde a un mensaje o escribe #tagone @numero',
      }, { quoted: msg })
      return
    }

    const resolved = await resolveJidFull(sock, rawTarget, jid)

    // buscar en participantes del grupo para obtener el JID real
    // convierte el LID (+1 610...) al numero real (+52..., +51..., etc)
    const groupMetadata = await sock.groupMetadata(jid)
    const participant   = groupMetadata.participants.find(p =>
      p.id === rawTarget ||
      (p as any).lid === rawTarget ||
      p.id === resolved.jid
    )

    const finalJid   = participant?.id ?? resolved.jid
    const pureNumber = (finalJid.split('@')[0] ?? finalJid.replace(/[^0-9]/g, ''))

    const customText = args.filter(a => !a.startsWith('@')).join(' ').trim()

    const text = customText
      ? `${customText}\n@${pureNumber}`
      : `@${pureNumber}`

    await sock.sendMessage(jid, {
      text,
      mentions: [finalJid],
    }, { quoted: msg })
  },
}

export default command