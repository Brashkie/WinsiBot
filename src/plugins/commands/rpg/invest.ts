import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getUserData, patchUserData, isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown } from '@core/events.js'
import { market, resolveSymbol, fmtPrice, fmtPct, trendArrow, TIMEFRAMES } from '@lib/market.js'

// ─── Apuestas pendientes (una por usuario) ─────────────────────────────────────

interface Bet {
  sender:     string
  symbol:     string
  direction:  'up' | 'down'
  amount:     number
  entryPrice: number
  resolveAt:  number
  chatJid:    string
  sock:       any
  timer:      NodeJS.Timeout
}

const activeBets = new Map<string, Bet>()

// Payout: 80% de ganancia (1.8x)
const PAYOUT = 0.80

// Cooldown entre apuestas: 10s
const BET_CD = 10_000

// ─── Resolver apuesta ─────────────────────────────────────────────────────────

async function resolveBet(bet: Bet): Promise<void> {
  activeBets.delete(bet.sender)

  const asset    = resolveSymbol(bet.symbol)
  const exitPrice = asset?.price ?? bet.entryPrice
  const priceDiff = exitPrice - bet.entryPrice
  const won       = bet.direction === 'up' ? priceDiff > 0 : priceDiff < 0

  const pct   = ((exitPrice - bet.entryPrice) / bet.entryPrice) * 100
  const arrow = trendArrow(pct)

  const user   = getUserData(bet.sender)
  const gain   = Math.round(bet.amount * PAYOUT)
  const profit = won ? gain : -bet.amount
  const newBal = Math.max(0, user.money + profit)

  patchUserData(bet.sender, { money: newBal })

  const dirLabel = bet.direction === 'up' ? '📈 SUBE' : '📉 BAJA'
  const result   = won
    ? `✅ *¡ACERTASTE!*  ${dirLabel}`
    : `❌ *FALLASTE*  (el mercado fue ${trendArrow(-Math.sign(priceDiff) as any)})`

  const text = [
    `📊 *RESULTADO*`,
    ``,
    `  ${arrow} *${bet.symbol}*  ¥${fmtPrice(bet.entryPrice)} → ¥${fmtPrice(exitPrice)}`,
    `  Cambio: *${fmtPct(pct)}*`,
    ``,
    result,
    won
      ? `  Ganancia: *+¥${gain}*`
      : `  Pérdida:  *-¥${bet.amount}*`,
    `  Balance: ¥${newBal.toLocaleString()}`,
  ].join('\n')

  await safeSend(() => bet.sock.sendMessage(bet.chatJid, { text })).catch(() => {})
}

// ─── Comando ──────────────────────────────────────────────────────────────────

const command: Command = {
  name:        'invertir',
  aliases:     ['apostar', 'bet', 'trade', 'inv'],
  description: 'Apuesta sobre si un activo sube o baja  |  !invertir btc 100 sube 1m',
  category:    'rpg',
  cooldown:    0,

  async execute({ sock, jid, msg, sender, pushName, args, prefix }) {

    // ─── Ya tiene una apuesta activa ──────────────────────────────────────
    if (activeBets.has(sender)) {
      const b    = activeBets.get(sender)!
      const left = Math.max(0, Math.ceil((b.resolveAt - Date.now()) / 1000))
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `§ Ya tienes una apuesta activa`,
          ``,
          `  *${b.symbol}*  ¥${b.amount}  ${b.direction === 'up' ? '📈 SUBE' : '📉 BAJA'}`,
          `  Resuelve en *${left}s*`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── Cooldown ──────────────────────────────────────────────────────────
    if (isOnCooldown(sender, 'lastBet', BET_CD)) {
      const left = getCooldownLeft(sender, 'lastBet', BET_CD)
      await safeSend(() => sock.sendMessage(jid, {
        text: `> ⏳ Espera *${fmtCooldown(left)}* antes de apostar de nuevo.`,
      }, { quoted: msg }))
      return
    }

    // ─── Parsear args: !invertir <símbolo> <monto> <sube|baja> [tiempo] ──
    const [symArg, amtArg, dirArg, tfArg] = args

    if (!symArg || !amtArg || !dirArg) {
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `📊 *INVERSIÓN BINARIA*`,
          ``,
          `\`${prefix}invertir <activo> <¥> <sube|baja> [tiempo]\``,
          ``,
          `  Activos:  BTC · ETH · GOLD · SOL · WINSI · BRSCO`,
          `  Tiempo:   30s · 1m · 3m · 5m (default: 1m)`,
          `  Pago:     +80% si aciertas, -100% si fallas`,
          ``,
          `*Ejemplo:*  \`${prefix}invertir btc 200 sube 1m\``,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const asset = resolveSymbol(symArg)
    if (!asset) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Activo *${symArg.toUpperCase()}* no existe\n§ Usa: BTC, ETH, GOLD, SOL, WINSI, BRSCO`,
      }, { quoted: msg }))
      return
    }

    const amount = parseInt(amtArg)
    if (isNaN(amount) || amount < 10) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Monto mínimo: ¥10`,
      }, { quoted: msg }))
      return
    }

    const dirNorm = dirArg.toLowerCase()
    const direction: 'up' | 'down' | null =
      ['sube', 'up', 'arriba', 'alza', '📈'].includes(dirNorm) ? 'up'   :
      ['baja', 'down', 'abajo', 'cae',  '📉'].includes(dirNorm) ? 'down' : null

    if (!direction) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Dirección inválida. Usa *sube* o *baja*`,
      }, { quoted: msg }))
      return
    }

    const tfKey  = (tfArg ?? '1m').toLowerCase()
    const tfMs   = TIMEFRAMES[tfKey] ?? TIMEFRAMES['1m']!
    const tfLabel = Object.entries(TIMEFRAMES).find(([,v]) => v === tfMs)?.[0] ?? '1m'

    const user = getUserData(sender, pushName)
    if (user.money < amount) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ No tienes suficientes BrasCoins (tienes ¥${user.money.toLocaleString()})`,
      }, { quoted: msg }))
      return
    }

    // Descontar apuesta inmediatamente
    patchUserData(sender, { money: user.money - amount })
    setCooldown(sender, 'lastBet')

    const entryPrice = asset.price
    const resolveAt  = Date.now() + tfMs
    const gain       = Math.round(amount * PAYOUT)
    const dirLabel   = direction === 'up' ? '📈 SUBE' : '📉 BAJA'

    const timer = setTimeout(() => resolveBet(bet), tfMs)

    const bet: Bet = { sender, symbol: asset.symbol, direction, amount, entryPrice, resolveAt, chatJid: jid, sock, timer }
    activeBets.set(sender, bet)

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `📊 *INVERSIÓN ABIERTA*`,
        ``,
        `│ Activo:   ${asset.emoji} *${asset.symbol}*  (${asset.name})`,
        `│ Entrada:  ¥${fmtPrice(entryPrice)}`,
        `│ Apuesta:  ¥${amount.toLocaleString()}`,
        `│ Dirección: ${dirLabel}`,
        `│ Tiempo:   *${tfLabel}*`,
        `│ Pago si ganas: +¥${gain} (+80%)`,
        ``,
        `_Resultado en ${tfLabel}..._`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
