import type { Command } from '../../../types/index.js'
import { activeChars, addToInventory } from './rollwaifu.js'

const C_COOLDOWN = 10 * 60 * 1000
const STEAL_TIME = 16 * 1000
const cCooldowns = new Map<string, number>()

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function num(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net|@lid/g, '').replace(/[^0-9]/g, '')
}

const command: Command = {
  name:        'c',
  aliases:     ['claim', 'reclamar'],
  description: 'Reclama el personaje activo respondiendo su mensaje',
  category:    'rpg',
  groupOnly:   true,
  cooldown:    0,

  async execute({ sock, jid, msg, sender, prefix }) {
    const active = activeChars.get(jid)

    if (!active) {
      await sock.sendMessage(jid, {
        text: `✗ No hay personaje activo.\n  Usa *${prefix}rw* para rodar uno.`,
      }, { quoted: msg })
      return
    }

    if (active.expiresAt < Date.now()) {
      activeChars.delete(jid)
      await sock.sendMessage(jid, {
        text: `✗ El personaje *${active.char.name}* ya expiró.`,
      }, { quoted: msg })
      return
    }

    // ─── debe responder al mensaje del personaje ──────────────────────────────
    const quotedId    = msg.message?.extendedTextMessage?.contextInfo?.stanzaId
    const activeMsgId = active.msgKey?.id

    if (!quotedId || !activeMsgId || quotedId !== activeMsgId) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Debes *responder* al mensaje del personaje para reclamarlo.`,
          `> § Busca el mensaje de *${active.char.name}* y responde con *${prefix}c*`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // ─── cooldown ─────────────────────────────────────────────────────────────
    const lastClaim = cCooldowns.get(sender) ?? 0
    const elapsed   = Date.now() - lastClaim
    if (elapsed < C_COOLDOWN) {
      await sock.sendMessage(jid, {
        text: `✗ Debes esperar *${formatTime(C_COOLDOWN - elapsed)}* para reclamar de nuevo.`,
      }, { quoted: msg })
      return
    }

    const charDetails = (name: string, owner: string) => [
      `✔ *${name}* reclamado por @${num(owner)}!`,
      ``,
      `  ◈ Nombre  » *${name}*`,
      `  ☆ Valor   » *${active.char.value}*`,
      `  ◆ Fuente  » *${active.char.source}*`,
    ].join('\n')

    // ─── primer claim ─────────────────────────────────────────────────────────
    if (!active.claimedBy) {
      active.claimedBy = sender
      active.claimedAt = Date.now()
      active.stealEnds = Date.now() + STEAL_TIME
      activeChars.set(jid, active)
      cCooldowns.set(sender, Date.now())

      const sent = await sock.sendMessage(jid, {
        text:     `⏳ @${num(sender)} reclamando *${active.char.name}*...`,
        mentions: [sender],
      }, { quoted: msg })
      const key = sent?.key

      setTimeout(async () => {
        const current = activeChars.get(jid)
        if (!current || current.claimedBy !== sender || current.char.name !== active.char.name) return
        addToInventory(sender, current.char)
        activeChars.delete(jid)
        await sock.sendMessage(jid, {
          text:     charDetails(current.char.name, sender),
          mentions: [sender],
          edit:     key,
        } as any).catch(() => {})
      }, STEAL_TIME)

      return
    }

    // ─── intento de robo ──────────────────────────────────────────────────────
    if (active.stealEnds && Date.now() < active.stealEnds) {
      if (active.claimedBy === sender) {
        await sock.sendMessage(jid, {
          text: `✗ Ya reclamaste este personaje, espera los 16 segundos.`,
        }, { quoted: msg })
        return
      }

      const prevOwner  = active.claimedBy
      active.claimedBy = sender
      active.claimedAt = Date.now()
      active.stealEnds = Date.now() + STEAL_TIME
      activeChars.set(jid, active)
      cCooldowns.set(sender, Date.now())

      const sent = await sock.sendMessage(jid, {
        text:     `⚡ @${num(sender)} robó el claim a @${num(prevOwner)}!`,
        mentions: [sender, prevOwner],
      }, { quoted: msg })
      const key = sent?.key

      setTimeout(async () => {
        const current = activeChars.get(jid)
        if (!current || current.claimedBy !== sender || current.char.name !== active.char.name) return
        addToInventory(sender, current.char)
        activeChars.delete(jid)
        await sock.sendMessage(jid, {
          text:     charDetails(current.char.name, sender),
          mentions: [sender],
          edit:     key,
        } as any).catch(() => {})
      }, STEAL_TIME)

      return
    }

    // tiempo de robo expirado
    await sock.sendMessage(jid, {
      text: `✗ El tiempo para reclamar *${active.char.name}* ya pasó.`,
    }, { quoted: msg })
  },
}

export default command
