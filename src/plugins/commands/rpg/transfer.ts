import type { Command } from '../../../types/index.js'
import type { WASocket } from '@whiskeysockets/baileys'
import { getUserData, patchUserData } from '@core/events.js'

type Item = 'money' | 'diamonds' | 'exp'

const LABELS: Record<Item, string> = {
  money:    '¥ BrasCoins',
  diamonds: '💎 Diamantes',
  exp:      '✦ XP',
}

const pending = new Map<string, {
  to: string
  item: Item
  amount: number
  timer: ReturnType<typeof setTimeout>
}>()

// El prompt de confirmación dice "Escribe si o no" — un mensaje SIN prefijo,
// como cualquier respuesta normal de chat. Pero execute() de un Command solo
// corre cuando el mensaje SÍ tiene el prefijo del bot (!transfer ...), así
// que un "si" suelto nunca llegaba hasta acá — se iba por la rama "sin
// prefijo" del handler y no la revisaba nadie. Por eso se expone esta función
// para que handler.ts la intercepte ahí, igual que ya hace con quiz/drawguess.
export async function handleTransferConfirm(
  sock:   WASocket,
  jid:    string,
  sender: string,
  text:   string,
): Promise<boolean> {
  const p = pending.get(sender)
  if (!p) return false

  const ans = text.trim().toLowerCase()
  if (ans !== 'si' && ans !== 'no') return false

  clearTimeout(p.timer)
  pending.delete(sender)

  if (ans === 'no') {
    await sock.sendMessage(jid, { text: '> Transferencia cancelada.' })
    return true
  }

  const from = getUserData(sender)
  const to   = getUserData(p.to)

  if ((from[p.item] as number) < p.amount) {
    await sock.sendMessage(jid, { text: '> Ya no tienes suficiente.' })
    return true
  }

  patchUserData(sender, { [p.item]: (from[p.item] as number) - p.amount } as any)
  patchUserData(p.to,   { [p.item]: (to[p.item]   as number) + p.amount } as any)

  await sock.sendMessage(jid, {
    text: `*TRANSFERENCIA* ✓\n\n> ${p.amount} ${LABELS[p.item]} → @${p.to.split('@')[0]}`,
    mentions: [p.to],
  })
  return true
}

const command: Command = {
  name: 'transfer',
  aliases: ['transferir', 'dar', 'enviar', 'payxp'],
  description: 'Transfiere recursos a otro usuario',
  category: 'rpg',
  cooldown: 5,

  async execute({ sock, jid, msg, sender, pushName, args }) {
    // Confirmacion pendiente — por si alguien escribe "!transfer si" con
    // prefijo en vez de solo "si" (ambas formas funcionan)
    if (pending.has(sender)) {
      const consumed = await handleTransferConfirm(sock, jid, sender, args[0] ?? '')
      if (consumed) return
      await sock.sendMessage(jid, { text: '> Escribe *si* o *no*.' }, { quoted: msg })
      return
    }

    const itemArg   = (args[0] ?? '').toLowerCase() as Item
    const amountArg = parseInt(args[1] ?? '')
    const target    = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]

    const ITEMS: Item[] = ['money', 'diamonds', 'exp']

    if (!ITEMS.includes(itemArg) || isNaN(amountArg) || amountArg <= 0) {
      await sock.sendMessage(jid, {
        text: `*TRANSFERENCIA*

\`!transfer tipo cantidad @usuario\`

> \`money\`    — ¥ BrasCoins
> \`diamonds\` — 💎 Diamantes
> \`exp\`      — ✦ XP`,
      }, { quoted: msg })
      return
    }

    if (!target || target === sender) {
      await sock.sendMessage(jid, { text: '> Etiqueta al destinatario.' }, { quoted: msg })
      return
    }

    const user = getUserData(sender, pushName)
    if ((user[itemArg] as number) < amountArg) {
      await sock.sendMessage(jid, {
        text: `> No tienes suficiente ${LABELS[itemArg]}.`,
      }, { quoted: msg })
      return
    }

    const timer = setTimeout(async () => {
      pending.delete(sender)
      await sock.sendMessage(jid, { text: '> Tiempo agotado. Transferencia cancelada.' })
    }, 60_000)

    pending.set(sender, { to: target, item: itemArg, amount: amountArg, timer })

    await sock.sendMessage(jid, {
      text: `*CONFIRMAR*\n\n> ${amountArg} ${LABELS[itemArg]} → @${target.split('@')[0]}\n\n_Escribe *si* o *no* (60s)_`,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
