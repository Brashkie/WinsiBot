import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { sendCarousel, type CarouselCard } from '@lib/interactive.js'
import { config } from '@config'
import axios from 'axios'

// ─── Xbox Live / OpenXBL ────────────────────────────────────────────────────
// Requiere XBL_API_KEY en .env — key gratis en https://xbl.io/. La key del
// script original venía hardcodeada en texto plano dentro de un plugin
// compartido públicamente, así que ya no cuenta como privada; cada owner
// debe generar la suya.

const XBL_BASE = 'https://xbl.io/api/v2'
const FALLBACK_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Xbox_one_logo.svg/1200px-Xbox_one_logo.svg.png'

function xblHeaders(): Record<string, string> {
  return { accept: 'application/json', 'X-Authorization': config.xblApiKey ?? '' }
}

function noKeyText(): string {
  return [
    `✗ Este comando necesita una API key de Xbox Live configurada`,
    `§ El dueño del bot debe conseguir una gratis en https://xbl.io/ y ponerla en XBL_API_KEY (.env)`,
  ].join('\n')
}

function xblErrorText(err: any): string {
  if (err instanceof XblAuthExpiredError) {
    return [
      `✗ La sesión de Xbox Live vinculada a esta API key expiró`,
      `§ El dueño del bot debe volver a iniciar sesión en https://xbl.io/ (Login with Xbox) para renovarla`,
    ].join('\n')
  }
  const status = err?.response?.status
  if (status === 401) return '✗ La API key de Xbox Live configurada es inválida'
  if (status === 429) return '✗ Demasiadas solicitudes a Xbox Live — intenta de nuevo en unos segundos'
  if (err?.code === 'ECONNABORTED') return '✗ Xbox Live tardó demasiado en responder'
  return '✗ Error al consultar Xbox Live — intenta de nuevo más tarde'
}

// OpenXBL tiene un caso particular: cuando la sesión de Xbox Live vinculada a
// la API key expiró (pasa con el tiempo, hay que re-loguearse en xbl.io), NO
// devuelve un HTTP 401 — devuelve HTTP 200 con {"content":{},"code":401} en
// el cuerpo. Sin este chequeo, ese caso se confundía con "no hay resultados"
// (res.data?.people era undefined → null → "no encontré ningún jugador"),
// escondiendo el problema real (la key necesita renovarse) detrás de un
// mensaje que sugería que el Gamertag no existía. Confirmado en vivo: hasta
// buscar "majornelson" (cuenta oficial de Xbox) devolvía este mismo error.
class XblAuthExpiredError extends Error {
  constructor() { super('OpenXBL: sesión de Xbox Live expirada (code 401 en body HTTP 200)') }
}

function assertNotAuthError(data: any): void {
  const content = data?.content
  const hasPayload = !!(data?.people || data?.titles || content?.people || content?.titles)
  if (data && typeof data === 'object' && data.code === 401 && !hasPayload) {
    throw new XblAuthExpiredError()
  }
}

interface XblPerson {
  xuid:          string
  gamertag:      string
  gamerScore?:   string
  displayPicRaw?: string
  presenceState?: string
}

async function searchGamertag(tag: string): Promise<XblPerson | null> {
  const res = await axios.get(`${XBL_BASE}/search/${encodeURIComponent(tag)}`, {
    headers: xblHeaders(), timeout: 15_000,
  })
  assertNotAuthError(res.data)
  return res.data?.content?.people?.[0] ?? res.data?.people?.[0] ?? null
}

async function getFriends(xuid: string): Promise<XblPerson[]> {
  const res = await axios.get(`${XBL_BASE}/friends/${xuid}`, { headers: xblHeaders(), timeout: 15_000 })
  assertNotAuthError(res.data)
  return res.data?.content?.people ?? res.data?.people ?? []
}

interface XblAchievementTitle {
  name:        string
  achievement?: {
    currentAchievements?: number
    totalAchievements?:   number
    currentGamerscore?:   number
    totalGamerscore?:     number
  }
}

async function getAchievements(xuid: string): Promise<XblAchievementTitle[]> {
  const res = await axios.get(`${XBL_BASE}/achievements/player/${xuid}`, { headers: xblHeaders(), timeout: 15_000 })
  assertNotAuthError(res.data)
  return res.data?.content?.titles ?? res.data?.titles ?? []
}

function presenceLabel(state?: string): { emoji: string; text: string } {
  const s = (state ?? '').toLowerCase()
  if (s.includes('online'))  return { emoji: '🟢', text: 'En línea' }
  if (s.includes('away'))    return { emoji: '🟡', text: 'Ausente' }
  if (s.includes('offline')) return { emoji: '🔴', text: 'Desconectado' }
  return { emoji: '⚪', text: state || 'Desconocido' }
}

// ─── #mcsearch ────────────────────────────────────────────────────────────
const mcsearch: Command = {
  name:        'mcsearch',
  aliases:     ['xblsearch', 'gamertag'],
  description: 'Busca un perfil de Xbox Live por Gamertag',
  category:    'info',
  cooldown:    8,

  async execute({ sock, jid, msg, args }) {
    if (!config.xblApiKey) {
      await safeSend(() => sock.sendMessage(jid, { text: noKeyText() }, { quoted: msg }))
      return
    }

    const tag = args.join(' ').trim()
    if (!tag) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Escribe un Gamertag\n§ Ejemplo: !mcsearch Notch`,
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }))

    try {
      const player = await searchGamertag(tag)
      if (!player) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No encontré ningún jugador con el Gamertag *"${tag}"*`,
        }, { quoted: msg }))
        return
      }

      const caption = [
        `🎮 *Xbox Live — ${player.gamertag}*`,
        ``,
        `§ XUID » ${player.xuid}`,
        `§ Gamerscore » *${player.gamerScore ?? 'N/D'}*`,
      ].join('\n')

      if (player.displayPicRaw) {
        await safeSend(() => sock.sendMessage(jid, {
          image: { url: player.displayPicRaw! }, caption,
        }, { quoted: msg }))
      } else {
        await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
      }
    } catch (err: any) {
      await safeSend(() => sock.sendMessage(jid, { text: xblErrorText(err) }, { quoted: msg }))
    }
  },
}

// ─── #mcfriends ───────────────────────────────────────────────────────────
const mcfriends: Command = {
  name:        'mcfriends',
  aliases:     ['xblfriends'],
  description: 'Muestra los amigos de Xbox Live de un jugador (carrusel)',
  category:    'info',
  cooldown:    10,

  async execute({ sock, jid, msg, args, prefix }) {
    if (!config.xblApiKey) {
      await safeSend(() => sock.sendMessage(jid, { text: noKeyText() }, { quoted: msg }))
      return
    }

    const tag = args.join(' ').trim()
    if (!tag) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Escribe un Gamertag\n§ Ejemplo: !mcfriends Notch`,
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }))

    try {
      const player = await searchGamertag(tag)
      if (!player) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No encontré ningún jugador con el Gamertag *"${tag}"*`,
        }, { quoted: msg }))
        return
      }

      const friends = await getFriends(player.xuid)
      if (friends.length === 0) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ *${player.gamertag}* no tiene amigos públicos (XUID: ${player.xuid})`,
        }, { quoted: msg }))
        return
      }

      const cmd   = config.prefix[0] ?? prefix
      const total = Math.min(friends.length, 10)

      const cards: CarouselCard[] = friends.slice(0, total).map((f, i) => {
        const { emoji, text: statusText } = presenceLabel(f.presenceState)
        const gt = f.gamertag || 'Desconocido'
        const card: CarouselCard = {
          text: [
            `👤 *Gamertag:* ${gt}`,
            `🆔 *XUID:* ${f.xuid || 'N/A'}`,
            `${emoji} *Estado:* ${statusText}`,
            ``,
            `◆ Amigo ${i + 1} de ${total}`,
          ].join('\n'),
          footer:  `🎮 Xbox Live · Amigo de ${player.gamertag}`,
          buttons: [
            ['👤 Ver perfil', `${cmd}mcsearch ${gt}`],
            ['👥 Ver amigos', `${cmd}mcfriends ${gt}`],
          ],
          media: f.displayPicRaw || FALLBACK_AVATAR,
        }
        return card
      })

      await sendCarousel(
        sock, jid,
        `🎮 Amigos de ${player.gamertag.toUpperCase()} — mostrando ${total} de ${friends.length}`,
        `◈ Desliza para ver más amigos · Xbox Live`,
        cards,
        msg,
        { title: `🎮 Amigos de ${player.gamertag}` },
      )
    } catch (err: any) {
      await safeSend(() => sock.sendMessage(jid, { text: xblErrorText(err) }, { quoted: msg }))
    }
  },
}

// ─── #mcachievement ───────────────────────────────────────────────────────
const mcachievement: Command = {
  name:        'mcachievement',
  aliases:     ['mcachievements', 'xblachievement'],
  description: 'Muestra los logros de Xbox Live de un jugador',
  category:    'info',
  cooldown:    10,

  async execute({ sock, jid, msg, args }) {
    if (!config.xblApiKey) {
      await safeSend(() => sock.sendMessage(jid, { text: noKeyText() }, { quoted: msg }))
      return
    }

    const tag = args.join(' ').trim()
    if (!tag) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Escribe un Gamertag\n§ Ejemplo: !mcachievement Notch`,
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }))

    try {
      const player = await searchGamertag(tag)
      if (!player) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No encontré ningún jugador con el Gamertag *"${tag}"*`,
        }, { quoted: msg }))
        return
      }

      const titles = await getAchievements(player.xuid)
      if (titles.length === 0) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No se encontraron logros para *${player.gamertag}* (XUID: ${player.xuid})`,
        }, { quoted: msg }))
        return
      }

      const shown = titles.slice(0, 5)
      const lines = [
        `🏆 *Logros de ${player.gamertag}*`,
        `§ XUID » ${player.xuid}`,
        ``,
        ...shown.flatMap(t => [
          `🎮 *${t.name}*`,
          `⭐ Logros » ${t.achievement?.currentAchievements ?? 0}/${t.achievement?.totalAchievements ?? 0}`,
          `◈ Gamerscore » ${t.achievement?.currentGamerscore ?? 0}/${t.achievement?.totalGamerscore ?? 0}`,
          ``,
        ]),
        `§ Mostrando ${shown.length} de ${titles.length} juegos`,
      ]

      await safeSend(() => sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg }))
    } catch (err: any) {
      await safeSend(() => sock.sendMessage(jid, { text: xblErrorText(err) }, { quoted: msg }))
    }
  },
}

export default [mcsearch, mcfriends, mcachievement]
