import type { Command, BotContext } from '../../../types/index.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { getGroupConfig } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { EFECTOS, MAX_SEGUNDOS, aplicarEfecto, type Efecto } from '@lib/audioFx.js'
import { tx } from '@lib/i18n.js'
import { logger } from '@core/logger.js'

// Efectos de audio: #nightcore, #bass, #reverb… (la lista está en audioFx.ts).
// Un comando por efecto, todos con el mismo cuerpo: citando un audio, una nota
// de voz o un video, devuelve la nota de voz con el efecto.
//
// Respetan el interruptor `audios` del grupo (#audios off), que existía desde
// antes sin que ningún comando lo mirara.

/** Más largo que esto ni se baja: se cortaría igual a MAX_SEGUNDOS. */
const MAX_ORIGINAL = 15 * 60

const T = {
  uso:      { es: '{e} Citá un audio, una nota de voz o un video con `{p}{cmd}`.\n> `{p}efectos` — todos los efectos', en: '{e} Quote an audio, a voice note or a video with `{p}{cmd}`.\n> `{p}efectos` — every effect', pt: '{e} Cite um áudio, uma nota de voz ou um vídeo com `{p}{cmd}`.\n> `{p}efectos` — todos os efeitos' },
  apagados: { es: '> Los comandos de audio están apagados en este grupo (`{p}audios on`, admins).', en: '> Audio commands are turned off in this group (`{p}audios on`, admins).', pt: '> Os comandos de áudio estão desligados neste grupo (`{p}audios on`, admins).' },
  largo:    { es: '> Ese audio dura {m} min: hasta {max} min, y se usan los primeros {usa}.', en: '> That audio is {m} min long: up to {max} min, and the first {usa} are used.', pt: '> Esse áudio dura {m} min: até {max} min, e se usam os primeiros {usa}.' },
  error:    { es: '> No pude procesar ese audio.', en: '> I couldn\'t process that audio.', pt: '> Não consegui processar esse áudio.' },
  titulo:   { es: 'EFECTOS DE AUDIO', en: 'AUDIO EFFECTS', pt: 'EFEITOS DE ÁUDIO' },
  pie:      { es: '> Citá un audio, una nota de voz o un video con el comando. Hasta {usa} min.', en: '> Quote an audio, a voice note or a video with the command. Up to {usa} min.', pt: '> Cite um áudio, uma nota de voz ou um vídeo com o comando. Até {usa} min.' },
}

/** Qué hace cada uno, para #efectos. */
const QUE: Record<string, { es: string; en: string; pt: string }> = {
  nightcore: { es: 'más rápido y agudo', en: 'faster and higher', pt: 'mais rápido e agudo' },
  lento:     { es: 'lento y con eco (slowed)', en: 'slow with echo (slowed)', pt: 'lento e com eco (slowed)' },
  rapido:    { es: 'más rápido, mismo tono', en: 'faster, same pitch', pt: 'mais rápido, mesmo tom' },
  bass:      { es: 'graves al máximo', en: 'bass boosted', pt: 'graves no máximo' },
  reverb:    { es: 'como en una sala grande', en: 'like in a big hall', pt: 'como numa sala grande' },
  eco:       { es: 'eco de montaña', en: 'mountain echo', pt: 'eco de montanha' },
  ardilla:   { es: 'voz de ardilla', en: 'chipmunk voice', pt: 'voz de esquilo' },
  grave:     { es: 'voz grave', en: 'deep voice', pt: 'voz grave' },
  robot:     { es: 'voz de robot', en: 'robot voice', pt: 'voz de robô' },
  reversa:   { es: 'al revés', en: 'reversed', pt: 'ao contrário' },
  radio:     { es: 'como por radio o teléfono', en: 'like over a radio or phone', pt: 'como no rádio ou telefone' },
  vibrato:   { es: 'voz que tiembla', en: 'shaky voice', pt: 'voz tremida' },
  '8d':      { es: 'audio 8D, con auriculares', en: '8D audio, with headphones', pt: 'áudio 8D, com fones' },
}

const responder = (ctx: BotContext, text: string) =>
  safeSend(() => ctx.sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg }))

function comando(e: Efecto): Command {
  return {
    name:        e.nombre,
    aliases:     e.alias,
    description: `Efecto ${e.nombre} a un audio o video, citándolo`,
    category:    'media',
    cooldown:    10,

    async execute(ctx) {
      const { sock, jid, msg, prefix, lang, isGroup } = ctx
      if (isGroup && getGroupConfig(jid).audios === false) {
        await responder(ctx, tx(lang, T.apagados, { p: prefix }))
        return
      }
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      const fuente = quoted ?? msg.message
      const media = fuente?.audioMessage ?? fuente?.videoMessage
      if (!media) {
        await responder(ctx, tx(lang, T.uso, { e: e.emoji, p: prefix, cmd: ctx.command }))
        return
      }
      const segundos = Number(media.seconds ?? 0)
      if (segundos > MAX_ORIGINAL) {
        await responder(ctx, tx(lang, T.largo, { m: Math.round(segundos / 60), max: MAX_ORIGINAL / 60, usa: MAX_SEGUNDOS / 60 }))
        return
      }
      try {
        const original = await downloadMediaMessage({ ...msg, message: fuente } as any, 'buffer', {}) as Buffer
        const audio = await aplicarEfecto(original, e)
        await safeSend(() => sock.sendMessage(jid, { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg }))
      } catch (err: any) {
        logger.warn({ err: String(err?.message ?? err), efecto: e.nombre }, 'efecto de audio: no se pudo')
        await responder(ctx, tx(lang, T.error))
      }
    },
  }
}

const efectos: Command = {
  name:        'efectos',
  aliases:     ['audiofx', 'efectosaudio', 'effects'],
  description: 'Los efectos de audio: nightcore, bass, reverb, robot y más',
  category:    'media',
  cooldown:    5,

  async execute(ctx) {
    const { prefix, lang } = ctx
    await responder(ctx, [
      `╭─「 🎚️ ${tx(lang, T.titulo)} 」`,
      `│`,
      ...EFECTOS.map(e => `│ ${e.emoji} \`${prefix}${e.nombre}\` — ${tx(lang, QUE[e.nombre]!)}`),
      `│`,
      tx(lang, T.pie, { usa: MAX_SEGUNDOS / 60 }),
      `╰─`,
    ].join('\n'))
  },
}

export default [...EFECTOS.map(comando), efectos]
