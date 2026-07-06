import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { market, fmtPrice, fmtPct, trendArrow } from '@lib/market.js'

const command: Command = {
  name:        'mercado',
  aliases:     ['market', 'precios', 'coins', 'bolsa'],
  description: 'Panel del mercado virtual — precios en tiempo real',
  category:    'rpg',
  cooldown:    5,

  async execute({ sock, jid, msg, prefix }) {
    const assets = market.all()

    const rows = assets.map(a => {
      const pct    = market.change1h(a.symbol)
      const arrow  = trendArrow(pct)
      const spark  = market.spark(a.symbol, 12)
      const price  = fmtPrice(a.price)
      const change = fmtPct(pct)
      // fixed-width columns
      const sym    = a.symbol.padEnd(5)
      const pr     = `¥${price}`.padStart(10)
      const ch     = change.padStart(7)
      return `${a.emoji} *${sym}*  ${pr}  ${arrow} ${ch}\n    ${spark}`
    })

    const text = [
      `┌──────────────────────────────`,
      `│  📊 *MERCADO WA*`,
      `└──────────────────────────────`,
      ``,
      rows.join('\n\n'),
      ``,
      `──────────────────────────────`,
      `§ *${prefix}cotizacion <activo>*   — gráfico`,
      `§ *${prefix}invertir <activo> <¥> <sube|baja> [30s|1m|3m|5m]*`,
      `§ *${prefix}comprar <activo> <¥>*  — comprar y mantener`,
      `§ *${prefix}portafolio*             — tus posiciones`,
      ``,
      `_Activos: BTC · ETH · GOLD · SOL · WINSI · BRSCO_`,
    ].join('\n')

    await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
  },
}

export default command
