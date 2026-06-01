import type { Command } from '../../../types/index.js'
import { activeChars, addToInventory } from './rw.js'

const C_COOLDOWN = 10 * 60 * 1000
const STEAL_TIME = 16 * 1000
const cCooldowns = new Map<string, number>()

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const command: Command = {
  name: 'c',
  aliases: ['claim', 'reclamar'],
  description: 'Reclama el personaje activo respondiendo su mensaje',
  category: 'fun',
  groupOnly: true,
  cooldown: 0,

  async execute({ sock, jid, msg, sender, prefix }) {
    const active = activeChars.get(jid)

    // no hay personaje activo
    if (!active) {
      await sock.sendMessage(jid, {
        text: `✗ No hay personaje activo.\n  Usa *${prefix}rw* para rodar uno.`,
      }, { quoted: msg })
      return
    }

    // personaje expirado
    if (active.expiresAt < Date.now()) {
      activeChars.delete(jid)
      await sock.sendMessage(jid, {
        text: `✗ El personaje *${active.char.name}* ya expiro.`,
      }, { quoted: msg })
      return
    }

    // ─── verificar que sea respuesta al mensaje del personaje ─────────────────
    const quotedId   = msg.message?.extendedTextMessage?.contextInfo?.stanzaId
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

    // ─── verificar cooldown ───────────────────────────────────────────────────
    const lastClaim = cCooldowns.get(sender) ?? 0
    const elapsed   = Date.now() - lastClaim
    if (elapsed < C_COOLDOWN) {
      const remaining = C_COOLDOWN - elapsed
      await sock.sendMessage(jid, {
        text: `✗ Debes esperar *${formatTime(remaining)}* para reclamar de nuevo.`,
      }, { quoted: msg })
      return
    }

    const num = sender
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')
      .replace(/[^0-9]/g, '')

    // ─── nadie ha reclamado — primer claim ────────────────────────────────────
    if (!active.claimedBy) {
      active.claimedBy = sender
      active.claimedAt = Date.now()
      active.stealEnds = Date.now() + STEAL_TIME
      activeChars.set(jid, active)

      cCooldowns.set(sender, Date.now())

      await sock.sendMessage(jid, {
        text: [
          `◆ @${num} reclamo *${active.char.name}*!`,
        ].join('\n'),
        mentions: [sender],
      }, { quoted: msg })

      // después de 16s confirmar
      setTimeout(async () => {
        const current = activeChars.get(jid)
        if (!current) return
        if (current.claimedBy === sender && current.char.name === active.char.name) {
          addToInventory(sender, current.char)
          activeChars.delete(jid)

          await sock.sendMessage(jid, {
            text: [
              `✔ *${current.char.name}* ha sido reclamado por @${num}!`,
              ``,
              `  ◈ Nombre  » *${current.char.name}*`,
              `  ☆ Valor   » *${current.char.value}*`,
              `  ◆ Fuente  » *${current.char.source}*`,
            ].join('\n'),
            mentions: [sender],
          })
        }
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

      const prevOwner    = active.claimedBy
      const prevOwnerNum = prevOwner
        .replace('@s.whatsapp.net', '')
        .replace('@lid', '')
        .replace(/[^0-9]/g, '')

      active.claimedBy = sender
      active.claimedAt = Date.now()
      active.stealEnds = Date.now() + STEAL_TIME
      activeChars.set(jid, active)

      cCooldowns.set(sender, Date.now())

      await sock.sendMessage(jid, {
        text: [
          `◆ @${num} robo *${active.char.name}* de @${prevOwnerNum}!`,
        ].join('\n'),
        mentions: [sender, prevOwner],
      }, { quoted: msg })

      // nuevo timer 16s
      const newSender = sender
      setTimeout(async () => {
        const current = activeChars.get(jid)
        if (!current) return
        if (current.claimedBy === newSender && current.char.name === active.char.name) {
          addToInventory(newSender, current.char)
          activeChars.delete(jid)

          await sock.sendMessage(jid, {
            text: [
              `✔ *${current.char.name}* ha sido reclamado por @${num}!`,
              ``,
              `  ◈ Nombre  » *${current.char.name}*`,
              `  ☆ Valor   » *${current.char.value}*`,
              `  ◆ Fuente  » *${current.char.source}*`,
            ].join('\n'),
            mentions: [newSender],
          })
        }
      }, STEAL_TIME)

      return
    }

    // tiempo de robo expirado
    await sock.sendMessage(jid, {
      text: `✗ El tiempo para reclamar *${active.char.name}* ya paso.`,
    }, { quoted: msg })
  },
}

export default command