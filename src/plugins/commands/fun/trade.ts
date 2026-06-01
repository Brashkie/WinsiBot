import type { Command, RollCharacter, TradeRequest } from '../../../types/index'
import { getUserInventory } from './rw.js'

const pendingTrades = new Map<string, TradeRequest>()

// ─── Comando trade ────────────────────────────────────────────────────────────
const command: Command = {
  name: 'trade',
  aliases: ['intercambio', 'cambio'],
  description: 'Intercambia personajes con otro usuario',
  category: 'fun',
  groupOnly: true,
  cooldown: 10,

  async execute({ sock, jid, msg, args, sender, prefix }) {
    const text = args.join(' ').trim()

    // ─── aceptar intercambio ──────────────────────────────────────────────────
    if (text.toLowerCase() === 'aceptar') {
      // buscar trade pendiente donde el receptor es este usuario
      const tradeKey = [...pendingTrades.keys()].find(k => {
        const t = pendingTrades.get(k)!
        return t.to === sender && t.jid === jid && t.expiresAt > Date.now()
      })

      if (!tradeKey) {
        await sock.sendMessage(jid, {
          text: '✗ No tienes solicitudes de intercambio pendientes.',
        }, { quoted: msg })
        return
      }

      const trade = pendingTrades.get(tradeKey)!
      pendingTrades.delete(tradeKey)

      // hacer el intercambio en inventarios
      const invFrom = getUserInventory(trade.from)
      const invTo   = getUserInventory(trade.to)

      const idxFrom = invFrom.findIndex(c => c.name.toLowerCase() === trade.charFrom.toLowerCase())
      const idxTo   = invTo.findIndex(c => c.name.toLowerCase() === trade.charTo.toLowerCase())

      if (idxFrom === -1 || idxTo === -1) {
        await sock.sendMessage(jid, {
          text: '✗ Uno de los personajes ya no esta disponible.',
        }, { quoted: msg })
        return
      }

      const charFrom = invFrom.splice(idxFrom, 1)[0]!
      const charTo   = invTo.splice(idxTo, 1)[0]!

      invFrom.push({ ...charTo,   user: trade.from })
      invTo.push({   ...charFrom, user: trade.to   })

      const numFrom = trade.from.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
      const numTo   = trade.to.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

      await sock.sendMessage(jid, {
        text: [
          `◆ Intercambio aceptado!`,
          ``,
          `  ◈ @${numFrom} » *${charTo.name}*`,
          `  ◈ @${numTo} » *${charFrom.name}*`,
        ].join('\n'),
        mentions: [trade.from, trade.to],
      }, { quoted: msg })
      return
    }

    // ─── crear solicitud de intercambio ───────────────────────────────────────
    // formato: #trade miPersonaje / suPersonaje @usuario
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]

    if (!mentionedJid) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Menciona al usuario con quien intercambiar.`,
          ``,
          `  Uso: ${prefix}trade miPersonaje / suPersonaje @usuario`,
          `  Ejemplo: ${prefix}trade Eula / Himiko Toga @usuario`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // resolver JID real
    let targetJid = mentionedJid
    try {
      const metadata    = await sock.groupMetadata(jid)
      const participant = metadata.participants.find(p =>
        p.id === mentionedJid || (p as any).lid === mentionedJid
      )
      if (participant) targetJid = participant.id
    } catch {}

    // parsear personajes — formato: "miChar / suChar @mention"
    const cleanText  = text.replace(/@\d+/g, '').trim()
    const parts      = cleanText.split('/')
    const charFromName = parts[0]?.trim() ?? ''
    const charToName   = parts[1]?.trim() ?? ''

    if (!charFromName || !charToName) {
      await sock.sendMessage(jid, {
        text: `✗ Formato: ${prefix}trade miPersonaje / suPersonaje @usuario`,
      }, { quoted: msg })
      return
    }

    // verificar que el usuario tenga el personaje
    const invFrom  = getUserInventory(sender)
    const hasChar  = invFrom.some(c => c.name.toLowerCase() === charFromName.toLowerCase())

    if (!hasChar) {
      await sock.sendMessage(jid, {
        text: `✗ No tienes el personaje *${charFromName}* en tu inventario.`,
      }, { quoted: msg })
      return
    }

    // verificar que el target tenga el personaje
    const invTo     = getUserInventory(targetJid)
    const targetHas = invTo.some(c => c.name.toLowerCase() === charToName.toLowerCase())

    if (!targetHas) {
      const numTo = targetJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
      await sock.sendMessage(jid, {
        text:     `✗ @${numTo} no tiene el personaje *${charToName}* en su inventario.`,
        mentions: [targetJid],
      }, { quoted: msg })
      return
    }

    // crear solicitud
    const tradeKey = `${sender}-${targetJid}-${Date.now()}`
    pendingTrades.set(tradeKey, {
      from:      sender,
      to:        targetJid,
      charFrom:  charFromName,
      charTo:    charToName,
      jid,
      msgKey:    msg.key,
      expiresAt: Date.now() + 60_000, // 60 segundos
    })

    // limpiar después de 60s
    setTimeout(() => pendingTrades.delete(tradeKey), 60_000)

    const numFrom = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
    const numTo   = targetJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

    const sent = await sock.sendMessage(jid, {
      text: [
        `◆ @${numFrom} te ha enviado una solicitud de intercambio.`,
        ``,
        `  ◈ [@${numFrom}] *${charFromName}*`,
        `  ◈ [@${numTo}] *${charToName}*`,
        ``,
        `  § Para aceptar responde este mensaje con *Aceptar*`,
        `  § La solicitud expira en 60 segundos.`,
      ].join('\n'),
      mentions: [sender, targetJid],
    }, { quoted: msg })

    return
  },
}

export default command