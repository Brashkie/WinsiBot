import type { BotContext } from '../../../types/index.js'
import { commandRegistry } from '../index.js'
import { safeSend } from '@lib/media_sender.js'
import { t } from '@lib/i18n.js'
import { parecidos } from '@lib/similar.js'

// Un comando que no existe: avisar en el idioma de quien escribió y, si se
// parece a uno que sí existe (#trabajr, #menú), sugerirlo.

export async function handleNotFound(ctx: BotContext): Promise<void> {
  const { sock, jid, msg, command, prefix, lang } = ctx
  const similares = parecidos(command, commandRegistry.entries())

  await safeSend(() => sock.sendMessage(jid, {
    text: [
      t(lang, 'noExiste', { cmd: `${prefix}${command}` }),
      similares.length
        ? t(lang, 'quisiste', { sugerencias: similares.map(s => `*${prefix}${s}*`).join(', ') })
        : t(lang, 'verLista'),
      similares.length ? '' : `> *${prefix}help*`,
    ].filter(Boolean).join('\n'),
  }, { quoted: msg }))
}
