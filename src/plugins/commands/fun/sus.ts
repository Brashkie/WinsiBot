import type { Command } from '../../../types/index.js'
import { resolveJidFull } from '@core/lid_mapper.js'
import { downloadBuffer } from '@lib/downloader.js'

const FRASES = [
  '◆ *{name}* fue visto cerca del cuerpo... muy sospechoso',
  '◆ *{name}* es el impostor, lo vi con mis propios ojos',
  '◆ *{name}* estaba en la ventilacion haciendo cosas raras',
  '◆ *{name}* no hizo ninguna tarea en toda la partida',
  '◆ *{name}* mato a alguien en electrico, lo juro',
  '◆ *{name}* salio de un cadaver, es impostor 100%',
  '◆ Reporte de emergencia: *{name}* fue visto cerca del reactor',
  '◆ *{name}* se teletransporto, claramente impostor',
  '◆ Vote a *{name}* ya, no tiene coartada',
  '◆ *{name}* estaba solo en admin demasiado tiempo',
  '◆ *{name}* cerro la puerta y mato a dos personas',
  '◆ *{name}* es muy inocente... demasiado inocente 👀',
]

const GIFS = [
  'https://j.top4top.io/m_35185m8751.mp4',
  'https://a.top4top.io/m_3518n6si41.mp4',
  'https://f.top4top.io/m_3518mgxs11.mp4',
  'https://c.top4top.io/m_3518f5mtd1.mp4',
  'https://d.top4top.io/m_3518ja71k2.mp4',
  'https://f.top4top.io/m_3518hmrom1.mp4',
]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const command: Command = {
  name: 'sus',
  aliases: ['impostor', 'among'],
  description: 'Acusa a alguien de ser el impostor',
  category: 'fun',
  groupOnly: true,
  cooldown: 5,

  async execute({ sock, jid, msg, args, sender }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant

    const rawTarget = mentionRaw ?? quotedRaw ?? sender

    // resolver JID real
    let finalJid  = rawTarget
    let targetNum = (rawTarget.split('@')[0] ?? '').replace(/[^0-9]/g, '')

    try {
      const metadata    = await sock.groupMetadata(jid)
      const participant = metadata.participants.find(p =>
        p.id === rawTarget || (p as any).lid === rawTarget
      )
      if (participant) {
        finalJid  = participant.id
        targetNum = participant.id.split('@')[0] ?? targetNum
      }
    } catch {}

    // animacion de votacion
    const sent = await sock.sendMessage(jid, {
      text: '◈ Convocando reunion de emergencia...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Analizando comportamiento...',
      '◈◈◈ Revisando camaras...',
      '◈◈ Contando votos...',
      '◈ El resultado es...',
    ]

    for (const frame of frames) {
      await sleep(500)
      await sock.sendMessage(jid, { text: frame, edit: key } as any)
    }

    await sleep(400)

    // seleccionar frase y gif aleatorio
    const frase = (FRASES[Math.floor(Math.random() * FRASES.length)] ?? FRASES[0]!)
      .replace('{name}', `@${targetNum}`)

    const gifUrl = GIFS[Math.floor(Math.random() * GIFS.length)]!

    // descargar gif
    let buffer: Buffer | null = null
    try {
      buffer = await downloadBuffer(gifUrl)
    } catch {}

    // borrar animacion
    if (key) {
      await sock.sendMessage(jid, { delete: key }).catch(() => {})
    }

    await sleep(200)

    if (buffer) {
      await sock.sendMessage(jid, {
        video:       buffer,
        caption:     frase,
        gifPlayback: true,
        mentions:    [finalJid],
      }, { quoted: msg })
    } else {
      await sock.sendMessage(jid, {
        text:     frase,
        mentions: [finalJid],
      }, { quoted: msg })
    }
  },
}

export default command