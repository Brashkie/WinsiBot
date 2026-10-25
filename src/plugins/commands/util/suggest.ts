import type { Command } from '../../../types/index.js'
import { config } from '@config'
import { safeSend } from '@lib/media_sender.js'
import { getGroupMetadata } from '@core/groupCache.js'
import { tx } from '@lib/i18n.js'

// #suggest / #report: una sugerencia o un error, directo al privado del dueño
// del bot, con quién lo manda y desde qué grupo. La espera larga es a
// propósito: es un canal al dueño, no un chat.

const MAX = 600

const T = {
  uso:     { es: '✗ Uso: `{p}suggest <tu idea o el error que encontraste>`', en: '✗ Usage: `{p}suggest <your idea or the bug you found>`', pt: '✗ Uso: `{p}suggest <sua ideia ou o erro que achou>`' },
  largo:   { es: '✗ Hasta {n} caracteres.', en: '✗ Up to {n} characters.', pt: '✗ Até {n} caracteres.' },
  sinDuenio: { es: '> Este bot no tiene un dueño configurado para recibirlo.', en: '> This bot has no owner set up to receive it.', pt: '> Este bot não tem um dono configurado para receber.' },
  enviado: { es: '📨 ¡Gracias! Se lo mandé al dueño del bot.', en: '📨 Thanks! I sent it to the bot owner.', pt: '📨 Valeu! Mandei para o dono do bot.' },
}

const command: Command = {
  name:        'suggest',
  aliases:     ['report', 'reportar', 'sugerir', 'sugerencia', 'reporte'],
  description: 'Manda una sugerencia o un error al dueño del bot  |  !suggest <texto>',
  category:    'util',
  cooldown:    120,

  async execute({ sock, jid, msg, args, sender, pushName, isGroup, prefix, lang, command: usado }) {
    const texto = args.join(' ').trim()
    if (!texto) return void await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.uso, { p: prefix }) }, { quoted: msg }))
    if ([...texto].length > MAX) return void await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.largo, { n: MAX }) }, { quoted: msg }))
    if (!config.ownerJid.length) return void await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.sinDuenio) }, { quoted: msg }))

    const grupo = isGroup ? (await getGroupMetadata(sock, jid).catch(() => null))?.subject ?? jid : 'privado'
    const tipo = ['report', 'reportar', 'reporte'].includes(usado) ? '🐞 REPORTE' : '💡 SUGERENCIA'
    const aviso = [
      `╭─「 ${tipo} 」`,
      `│ De: @${sender.split('@')[0]} (${pushName || 'sin nombre'})`,
      `│ Desde: ${grupo}`,
      `╰─`,
      ``,
      texto,
    ].join('\n')
    for (const owner of config.ownerJid) {
      const destino = owner.includes('@') ? owner : `${owner.replace(/\D/g, '')}@s.whatsapp.net`
      await safeSend(() => sock.sendMessage(destino, { text: aviso, mentions: [sender] }))
    }
    await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.enviado) }, { quoted: msg }))
  },
}

export default command
