import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData, isOnCooldown, setCooldown, fmtCooldown } from '@core/events.js'
import {
  GiftManager,
  GIFT_COST,
  type GiftInventory,
} from '@lib/gift.js'

function inv(jid: string): GiftInventory {
  return getUserData(jid).giftInbox ?? GiftManager.defaultInventory()
}

const command: Command = {
  name:        'regalo',
  aliases:     ['gift', 'regalar'],
  description: 'Sistema de regalos entre usuarios',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const user = getUserData(sender, pushName)
    const sub  = (args[0] ?? '').toLowerCase()
    const mentioned = (msg as any).message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined ?? []

    // ── Catálogo ──────────────────────────────────────────────────────────────
    if (!sub || sub === 'catalogo' || sub === 'catálogo' || sub === 'cat') {
      const filter = args[1] as any
      await sock.sendMessage(jid, { text: GiftManager.formatCatalog(filter) }, { quoted: msg })
      return
    }

    // ── Enviar ────────────────────────────────────────────────────────────────
    if (sub === 'enviar' || sub === 'send' || sub === 'dar') {
      const target = mentioned[0]
      const itemId = args.find(a => !a.startsWith('@') && a !== sub) ?? ''
      const msgParts = args.slice(args.indexOf(itemId) + 1)
      const giftMsg  = msgParts.join(' ')
      const anonymous = giftMsg.toLowerCase().startsWith('anon')
      const realMsg   = anonymous ? giftMsg.slice(4).trim() : giftMsg

      if (!target || !itemId) {
        await sock.sendMessage(jid, {
          text: `_Uso: !regalo enviar @usuario <id> [mensaje]\nEjemplo: !regalo enviar @alguien rose "Te quiero!"\nPara anónimo: !regalo enviar @alguien flower anon Tu mensaje_\n\nVe el catálogo: !regalo catalogo_`,
        }, { quoted: msg })
        return
      }

      if (target === sender) {
        await sock.sendMessage(jid, { text: `_No puedes enviarte regalos a ti mismo._` }, { quoted: msg })
        return
      }

      const item = GiftManager.getItem(itemId)
      if (!item) {
        await sock.sendMessage(jid, { text: `❌ Ítem \`${itemId}\` no existe. Ve: !regalo catalogo` }, { quoted: msg })
        return
      }

      const cost = GIFT_COST[item.rarity]
      if (user.money < cost) {
        await sock.sendMessage(jid, {
          text: `❌ Necesitas *${cost.toLocaleString()} monedas* para regalar ${item.emoji} ${item.name}.\nTienes: ${user.money.toLocaleString()} 💰`,
        }, { quoted: msg })
        return
      }

      const CD = 30_000
      if (isOnCooldown(sender, 'lastGift', CD)) {
        const left = fmtCooldown(CD - (Date.now() - getUserData(sender).cooldowns.lastGift))
        await sock.sendMessage(jid, { text: `⏳ Espera *${left}* para enviar otro regalo.` }, { quoted: msg })
        return
      }

      const record = GiftManager.send(sender, target, itemId, realMsg, anonymous)!
      const targetInv = inv(target)
      targetInv.inbox.push(record)
      const senderInv = inv(sender)
      senderInv.sent++

      patchUserData(sender, { money: user.money - cost, giftInbox: senderInv })
      patchUserData(target, { giftInbox: targetInv })
      setCooldown(sender, 'lastGift')

      await sock.sendMessage(jid, {
        text: `🎁 *Regalo enviado!*\n${item.emoji} ${item.name} → @${target.split('@')[0]}${realMsg ? `\n_"${realMsg}"_` : ''}`,
        mentions: anonymous ? [target] : [sender, target],
      }, { quoted: msg })

      await sock.sendMessage(jid, {
        text: `📦 @${target.split('@')[0]}, tienes un nuevo regalo${anonymous ? ' de *alguien especial*' : ''}!\n_!regalo buzon_`,
        mentions: [target],
      }).catch(() => {})
      return
    }

    // ── Buzón ─────────────────────────────────────────────────────────────────
    if (sub === 'buzon' || sub === 'buzón' || sub === 'inbox') {
      await sock.sendMessage(jid, { text: GiftManager.formatInbox(inv(sender).inbox) }, { quoted: msg })
      return
    }

    // ── Abrir ─────────────────────────────────────────────────────────────────
    if (sub === 'abrir' || sub === 'open') {
      const userInv = inv(sender)
      const n       = parseInt(args[1] ?? '') - 1
      const sorted  = [...userInv.inbox].sort((a, b) => b.timestamp - a.timestamp)

      if (isNaN(n) || n < 0 || n >= sorted.length) {
        await sock.sendMessage(jid, { text: `_Uso: !regalo abrir <N>\nVe tu buzón: !regalo buzon_` }, { quoted: msg })
        return
      }

      const record = sorted[n]!
      if (record.opened) {
        await sock.sendMessage(jid, { text: `_Este regalo ya fue abierto._` }, { quoted: msg })
        return
      }

      const item = GiftManager.open(record)
      patchUserData(sender, { giftInbox: userInv })

      if (!item) {
        await sock.sendMessage(jid, { text: `❌ Error al abrir.` }, { quoted: msg })
        return
      }

      await sock.sendMessage(jid, {
        text: `🎁 *¡Abriste un regalo!*\n\n${item.emoji} *${item.name}*\n_${item.desc}_\nValor: ${item.value.toLocaleString()} 💰${record.message ? `\n\n💬 _"${record.message}"_` : ''}`,
      }, { quoted: msg })
      return
    }

    // ── Wishlist ──────────────────────────────────────────────────────────────
    if (sub === 'wishlist' || sub === 'deseos') {
      const userInv = inv(sender)
      const action  = (args[1] ?? '').toLowerCase()

      if (!action) {
        if (!userInv.wishlist.length) {
          await sock.sendMessage(jid, { text: `_Lista de deseos vacía.\n!regalo wishlist add <itemId>_` }, { quoted: msg })
          return
        }
        const lines = ['*🌟 LISTA DE DESEOS*', '']
        for (const id of userInv.wishlist) {
          const i = GiftManager.getItem(id)
          lines.push(i ? `${i.emoji} ${i.name} (\`${id}\`)` : `\`${id}\``)
        }
        await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
        return
      }

      if (action === 'add' || action === 'añadir') {
        const id = args[2] ?? ''
        if (!GiftManager.getItem(id)) {
          await sock.sendMessage(jid, { text: `❌ Ítem no encontrado.` }, { quoted: msg })
          return
        }
        if (userInv.wishlist.includes(id)) {
          await sock.sendMessage(jid, { text: `_Ya está en tu lista._` }, { quoted: msg })
          return
        }
        if (userInv.wishlist.length >= 10) {
          await sock.sendMessage(jid, { text: `❌ Lista llena (máx 10).` }, { quoted: msg })
          return
        }
        userInv.wishlist.push(id)
        patchUserData(sender, { giftInbox: userInv })
        const i = GiftManager.getItem(id)!
        await sock.sendMessage(jid, { text: `✅ ${i.emoji} *${i.name}* añadido a tu lista.` }, { quoted: msg })
        return
      }

      if (action === 'remove' || action === 'quitar') {
        const id = args[2] ?? ''
        const userInv2 = inv(sender)
        userInv2.wishlist = userInv2.wishlist.filter(i => i !== id)
        patchUserData(sender, { giftInbox: userInv2 })
        await sock.sendMessage(jid, { text: `✅ Eliminado de tu lista.` }, { quoted: msg })
        return
      }
    }

    // ── Intercambio ──────────────────────────────────────────────────────────
    if (sub === 'intercambio' || sub === 'trade') {
      const action  = (args[1] ?? '').toLowerCase()
      const target  = mentioned[0]

      if (!action || action === 'ver') {
        const offer = GiftManager.getTradeForUser(sender)
        if (!offer) {
          await sock.sendMessage(jid, { text: `_No tienes ofertas activas._` }, { quoted: msg })
          return
        }
        const giving  = GiftManager.getItem(offer.giving)
        const wanting = GiftManager.getItem(offer.wanting)
        const isFrom  = offer.from === sender
        await sock.sendMessage(jid, {
          text: [
            `*🔄 INTERCAMBIO ACTIVO* (ID: ${offer.id})`,
            isFrom ? `Ofreces: ${giving?.emoji} ${giving?.name}` : `Recibirías: ${giving?.emoji} ${giving?.name}`,
            isFrom ? `Pides: ${wanting?.emoji} ${wanting?.name}` : `Darías: ${wanting?.emoji} ${wanting?.name}`,
            `Para aceptar: !regalo intercambio aceptar ${offer.id}`,
          ].join('\n'),
        }, { quoted: msg })
        return
      }

      if (action === 'proponer') {
        const givingId  = args[2] ?? ''
        const wantingId = args[3] ?? ''
        if (!target || !givingId || !wantingId) {
          await sock.sendMessage(jid, { text: `_Uso: !regalo intercambio proponer @usuario <item_que_das> <item_que_quieres>_` }, { quoted: msg })
          return
        }
        const offer = GiftManager.proposeTrade(sender, target, givingId, wantingId)
        if (!offer) {
          await sock.sendMessage(jid, { text: `❌ Ítems inválidos.` }, { quoted: msg })
          return
        }
        const g = GiftManager.getItem(givingId)
        const w = GiftManager.getItem(wantingId)
        await sock.sendMessage(jid, {
          text: `🔄 Propuesta enviada a @${target.split('@')[0]}!\nDas: ${g?.emoji} ${g?.name} → Recibes: ${w?.emoji} ${w?.name}\nID: \`${offer.id}\` (5 min para aceptar)`,
          mentions: [target],
        }, { quoted: msg })
        return
      }

      if (action === 'aceptar') {
        const id    = args[2] ?? ''
        const offer = GiftManager.getTrade(id)
        if (!offer || offer.to !== sender) {
          await sock.sendMessage(jid, { text: `❌ Oferta no encontrada o no es para ti.` }, { quoted: msg })
          return
        }
        GiftManager.cancelTrade(id)
        const g = GiftManager.getItem(offer.giving)
        const w = GiftManager.getItem(offer.wanting)
        await sock.sendMessage(jid, {
          text: `✅ *Intercambio realizado!*\n${g?.emoji} ${g?.name} ↔️ ${w?.emoji} ${w?.name}`,
        }, { quoted: msg })
        return
      }

      if (action === 'cancelar') {
        const offer = GiftManager.getTradeForUser(sender)
        if (!offer || offer.from !== sender) {
          await sock.sendMessage(jid, { text: `_No tienes ofertas activas para cancelar._` }, { quoted: msg })
          return
        }
        GiftManager.cancelTrade(offer.id)
        await sock.sendMessage(jid, { text: `✅ Oferta cancelada.` }, { quoted: msg })
        return
      }
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*🎁 SISTEMA DE REGALOS*

> !regalo catalogo — Ver todos los ítems
> !regalo enviar @user <id> [msg] — Enviar regalo
> !regalo buzon — Ver regalos recibidos
> !regalo abrir <N> — Abrir regalo N
> !regalo wishlist — Lista de deseos
> !regalo intercambio proponer @user <das> <quieres>

_Para envío anónimo, empieza el mensaje con "anon"_`,
    }, { quoted: msg })
  },
}

export default command
