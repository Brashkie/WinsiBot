import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import axios from 'axios'

// ─── Minecraft Java Edition — UUID + Crafatar ──────────────────────────────
// Sin API key: Mojang y Crafatar son públicas. Resuelve UUID por nombre de
// usuario (1. Mojang, 2. fallback minecraftuuid.com si Mojang no responde).

async function getUUID(username: string): Promise<string | null> {
  const clean = username.trim().replace(/[^A-Za-z0-9_]/g, '')
  if (!clean) return null

  try {
    const res = await axios.get(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(clean)}`,
      { timeout: 10_000, validateStatus: () => true },
    )
    if (res.status === 200 && res.data?.id) return res.data.id
  } catch { /* probar fallback */ }

  try {
    const res = await axios.get(
      `https://minecraftuuid.com/api/?username=${encodeURIComponent(clean)}`,
      { timeout: 10_000, validateStatus: () => true },
    )
    const id = res.data?.uuid ?? res.data?.id
    if (res.status === 200 && id) return String(id).replace(/-/g, '')
  } catch { /* sin suerte */ }

  return null
}

function notFoundText(name: string): string {
  return `✗ No se encontró el jugador de Java Minecraft *${name}*`
}

function usageText(cmd: string): string {
  return `✗ Ingresa un nombre de jugador\n§ Ejemplo: !${cmd} Notch`
}

// ─── #mcuuid ────────────────────────────────────────────────────────────
const mcuuid: Command = {
  name:        'mcuuid',
  aliases:     [],
  description: 'Obtiene el UUID de un jugador de Minecraft Java',
  category:    'info',
  cooldown:    5,

  async execute({ sock, jid, msg, args }) {
    const name = args[0]
    if (!name) {
      await safeSend(() => sock.sendMessage(jid, { text: usageText('mcuuid') }, { quoted: msg }))
      return
    }

    const uuid = await getUUID(name)
    if (!uuid) {
      await safeSend(() => sock.sendMessage(jid, { text: notFoundText(name) }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      text: `◈ UUID de *${name}*:\n\`${uuid}\``,
    }, { quoted: msg }))
  },
}

// ─── #mcavatar / #mchead / #mcbody — mismo patrón, distinto endpoint ──────
function crafatarCommand(name: string, endpoint: (uuid: string) => string, label: string): Command {
  return {
    name,
    aliases:     [],
    description: `Muestra la ${label} de un jugador de Minecraft Java`,
    category:    'info',
    cooldown:    5,

    async execute({ sock, jid, msg, args }) {
      const target = args[0]
      if (!target) {
        await safeSend(() => sock.sendMessage(jid, { text: usageText(name) }, { quoted: msg }))
        return
      }

      const uuid = await getUUID(target)
      if (!uuid) {
        await safeSend(() => sock.sendMessage(jid, { text: notFoundText(target) }, { quoted: msg }))
        return
      }

      await safeSend(() => sock.sendMessage(jid, {
        image:   { url: endpoint(uuid) },
        caption: `🧊 ${label[0]!.toUpperCase()}${label.slice(1)} de *${target}*`,
      }, { quoted: msg }))
    },
  }
}

const mcavatar = crafatarCommand('mcavatar', uuid => `https://crafatar.com/avatars/${uuid}?overlay`, 'avatar')
const mchead   = crafatarCommand('mchead',   uuid => `https://crafatar.com/renders/head/${uuid}?overlay`, 'cabeza')
const mcbody   = crafatarCommand('mcbody',   uuid => `https://crafatar.com/renders/body/${uuid}?overlay`, 'cuerpo')

// ─── #mcskin — se envía como documento descargable, no como imagen ───────
const mcskin: Command = {
  name:        'mcskin',
  aliases:     [],
  description: 'Descarga la skin de un jugador de Minecraft Java',
  category:    'info',
  cooldown:    5,

  async execute({ sock, jid, msg, args }) {
    const target = args[0]
    if (!target) {
      await safeSend(() => sock.sendMessage(jid, { text: usageText('mcskin') }, { quoted: msg }))
      return
    }

    const uuid = await getUUID(target)
    if (!uuid) {
      await safeSend(() => sock.sendMessage(jid, { text: notFoundText(target) }, { quoted: msg }))
      return
    }

    await safeSend(() => sock.sendMessage(jid, {
      document: { url: `https://crafatar.com/skins/${uuid}` },
      mimetype: 'image/png',
      fileName: `${target}_skin.png`,
      caption:  `🎨 Skin de *${target}*`,
    }, { quoted: msg }))
  },
}

export default [mcuuid, mcavatar, mchead, mcbody, mcskin]
