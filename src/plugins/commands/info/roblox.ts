import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import axios from 'axios'

const UA = 'Mozilla/5.0 (compatible; WinsiBot/1.0)'

interface RobloxUserInfo {
  id:               number
  name:             string
  displayName?:     string
  created:          string
  hasVerifiedBadge?: boolean
  isBanned?:        boolean
}

async function searchUser(query: string): Promise<{ id: number; name: string } | null> {
  const res = await axios.get('https://users.roblox.com/v1/users/search', {
    params:  { keyword: query, limit: 10 },
    headers: { 'User-Agent': UA },
    timeout: 15_000,
  })
  const first = res.data?.data?.[0]
  return first ? { id: first.id, name: first.name } : null
}

async function getUserInfo(userId: number | string): Promise<RobloxUserInfo | null> {
  try {
    const res = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
      headers: { 'User-Agent': UA },
      timeout: 15_000,
    })
    return res.data
  } catch (err: any) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

// Best-effort — si Roblox tarda o falla en alguno, se muestra "N/D" sin tumbar el comando.
async function getCount(kind: 'friends' | 'followers' | 'followings', userId: number): Promise<number | null> {
  try {
    const res = await axios.get(`https://friends.roblox.com/v1/users/${userId}/${kind}/count`, {
      headers: { 'User-Agent': UA },
      timeout: 8_000,
    })
    return res.data?.count ?? null
  } catch {
    return null
  }
}

async function getAvatarUrl(userId: number): Promise<string | null> {
  try {
    const res = await axios.get('https://thumbnails.roblox.com/v1/users/avatar', {
      params:  { userIds: userId, size: '420x420', format: 'Png', isCircular: false },
      headers: { 'User-Agent': UA },
      timeout: 10_000,
    })
    return res.data?.data?.[0]?.imageUrl ?? null
  } catch {
    return null
  }
}

const fmtCount = (n: number | null) => n === null ? 'N/D' : n.toLocaleString()

function fmtAge(createdISO: string): string {
  const days  = Math.floor((Date.now() - new Date(createdISO).getTime()) / 86_400_000)
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const rest   = days % 30
  const parts  = [
    years  ? `${years} año${years > 1 ? 's' : ''}`   : '',
    months ? `${months} mes${months > 1 ? 'es' : ''}` : '',
    !years && rest ? `${rest} día${rest > 1 ? 's' : ''}` : '',
  ].filter(Boolean)
  return parts.join(' ') || 'menos de 1 día'
}

const command: Command = {
  name:        'roblox',
  aliases:     ['rbx', 'robloxinfo'],
  description: 'Busca un usuario de Roblox por nombre o ID',
  category:    'info',
  cooldown:    8,

  async execute({ sock, jid, msg, args }) {
    const query = args.join(' ').trim()
    if (!query) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `✗ Escribe un nombre de usuario o ID`,
          `§ Ejemplo: !roblox builderman`,
          `§ También podés usar el ID: !roblox 156`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }))

    try {
      let userId: number | string
      let fallbackName: string | undefined

      if (/^\d+$/.test(query)) {
        userId = query
      } else {
        const found = await searchUser(query)
        if (!found) {
          await safeSend(() => sock.sendMessage(jid, {
            text: `✗ No encontré ningún usuario de Roblox llamado *"${query}"*`,
          }, { quoted: msg }))
          return
        }
        userId       = found.id
        fallbackName = found.name
      }

      const info = await getUserInfo(userId)
      if (!info) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Usuario no encontrado o cuenta eliminada${fallbackName ? ` (*${fallbackName}*)` : ''}`,
        }, { quoted: msg }))
        return
      }

      // Conteos + avatar en paralelo — antes el script original los pedía uno
      // por uno, sumando su latencia; acá corren juntos.
      const [friends, followers, following, avatarUrl] = await Promise.all([
        getCount('friends', info.id),
        getCount('followers', info.id),
        getCount('followings', info.id),
        getAvatarUrl(info.id),
      ])

      const createdDate = new Date(info.created).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric',
      })

      const lines = [
        `🎮 *Roblox — ${info.name}*`,
        ``,
        `§ Display name » *${info.displayName || info.name}*`,
        `§ ID » ${info.id}`,
        `§ Verificado » ${info.hasVerifiedBadge ? '✔ Sí' : '✗ No'}`,
        `§ Cuenta creada » ${createdDate}`,
        `§ Antigüedad » ${fmtAge(info.created)}`,
        ``,
        `◈ Amigos » *${fmtCount(friends)}*`,
        `◈ Seguidores » *${fmtCount(followers)}*`,
        `◈ Siguiendo » *${fmtCount(following)}*`,
        ``,
        `▸ https://www.roblox.com/users/${info.id}/profile`,
      ]
      if (info.isBanned) lines.splice(2, 0, `⚠ *Cuenta terminada/baneada*`)

      const caption = lines.join('\n')

      if (avatarUrl) {
        await safeSend(() => sock.sendMessage(jid, { image: { url: avatarUrl }, caption }, { quoted: msg }))
      } else {
        await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
      }
    } catch (err: any) {
      const status = err?.response?.status
      const text =
        status === 429            ? '✗ Demasiadas solicitudes a Roblox — intenta de nuevo en unos segundos' :
        err?.code === 'ECONNABORTED' ? '✗ Roblox tardó demasiado en responder' :
        '✗ Error al consultar Roblox — intenta de nuevo más tarde'
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    }
  },
}

export default command
