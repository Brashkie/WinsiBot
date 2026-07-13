import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getUserData, patchUserData } from '@core/events.js'
import { market, resolveSymbol, fmtPrice, fmtPct, trendArrow } from '@lib/market.js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ─── Portafolio spot (comprar y mantener) ────────────────────────────────────

interface Position {
  symbol:    string
  quantity:  number   // unidades del activo
  buyPrice:  number   // precio de entrada
  buyAt:     number   // timestamp
  cost:      number   // BrasCoins gastados
}

interface Portfolio {
  [jid: string]: Position[]
}

const DATA_DIR   = join(process.cwd(), 'data')
const PORT_FILE  = join(DATA_DIR, 'portfolio.json')

function loadPortfolio(): Portfolio {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    return JSON.parse(readFileSync(PORT_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function savePortfolio(p: Portfolio): void {
  writeFileSync(PORT_FILE, JSON.stringify(p, null, 2))
}

function getUserPositions(jid: string): Position[] {
  return loadPortfolio()[jid] ?? []
}

function setUserPositions(jid: string, positions: Position[]): void {
  const p = loadPortfolio()
  p[jid] = positions
  savePortfolio(p)
}

// ─── ASCII chart (mini candlestick con bloques) ───────────────────────────────

function buildChart(symbol: string): string {
  const a = resolveSymbol(symbol)
  if (!a) return ''

  const slice  = a.history.slice(-24)   // última hora
  const min    = Math.min(...slice)
  const max    = Math.max(...slice)
  const range  = max - min || 1
  const blocks = ['▁','▂','▃','▄','▅','▆','▇','█']

  const bar    = slice.map(p => blocks[Math.min(7, Math.floor(((p - min) / range) * 7))]!).join('')
  const pct1h  = market.change1h(symbol)

  const lines = [
    `${a.emoji} *${a.symbol}*  — ${a.name}`,
    ``,
    `  ¥${fmtPrice(max).padStart(10)}  ╮`,
    `  ${' '.repeat(12)}│  ${bar}`,
    `  ¥${fmtPrice(min).padStart(10)}  ╯`,
    ``,
    `  Precio:  *¥${fmtPrice(a.price)}*`,
    `  1h:      ${trendArrow(pct1h)} *${fmtPct(pct1h)}*`,
    `  Mín 1h:  ¥${fmtPrice(min)}`,
    `  Máx 1h:  ¥${fmtPrice(max)}`,
  ]
  return lines.join('\n')
}

// ─── Comando principal ────────────────────────────────────────────────────────

const command: Command = {
  name:        'cotizacion',
  aliases:     ['chart', 'grafico', 'precio', 'portafolio', 'portfolio', 'comprar', 'vender'],
  description: 'Gráfico de precio  |  comprar/vender activos  |  portafolio',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, pushName, args, command: cmd, prefix }) {

    // ─── !portafolio ───────────────────────────────────────────────────────
    if (cmd === 'portafolio' || cmd === 'portfolio') {
      const positions = getUserPositions(sender)

      if (positions.length === 0) {
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            `💼 *PORTAFOLIO*`,
            ``,
            `§ No tienes posiciones abiertas`,
            `§ Usa *${prefix}comprar <activo> <¥>* para comprar`,
          ].join('\n'),
        }, { quoted: msg }))
        return
      }

      let totalCost = 0
      let totalVal  = 0
      const rows = positions.map(p => {
        const asset    = resolveSymbol(p.symbol)
        const curPrice = asset?.price ?? p.buyPrice
        const curVal   = p.quantity * curPrice
        const pnl      = curVal - p.cost
        const pnlPct   = (pnl / p.cost) * 100
        totalCost += p.cost
        totalVal  += curVal
        return [
          `  ${asset?.emoji ?? '●'} *${p.symbol}*`,
          `    Entrada: ¥${fmtPrice(p.buyPrice)}  →  Actual: ¥${fmtPrice(curPrice)}`,
          `    Valor:   ¥${fmtPrice(curVal)}  P&L: ${trendArrow(pnl)} *${fmtPct(pnlPct)}* (${pnl >= 0 ? '+' : ''}¥${fmtPrice(pnl)})`,
        ].join('\n')
      })

      const totalPnl    = totalVal - totalCost
      const totalPnlPct = (totalPnl / totalCost) * 100

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `💼 *PORTAFOLIO*`,
          ``,
          rows.join('\n\n'),
          ``,
          `──────────────────────────`,
          `  Invertido: ¥${fmtPrice(totalCost)}`,
          `  Valor hoy: ¥${fmtPrice(totalVal)}`,
          `  P&L total: ${trendArrow(totalPnl)} *${fmtPct(totalPnlPct)}*`,
          ``,
          `§ *${prefix}vender <activo> <¥>* para cerrar posición`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── !comprar <activo> <monto> ─────────────────────────────────────────
    if (cmd === 'comprar') {
      const [symArg, amtArg] = args
      if (!symArg || !amtArg) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `\`${prefix}comprar <activo> <¥>\`\n\nEjemplo: \`${prefix}comprar btc 500\``,
        }, { quoted: msg }))
        return
      }

      const asset = resolveSymbol(symArg)
      if (!asset) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Activo *${symArg.toUpperCase()}* no existe`,
        }, { quoted: msg }))
        return
      }

      const cost = parseInt(amtArg)
      if (isNaN(cost) || cost < 50) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Monto mínimo: ¥50`,
        }, { quoted: msg }))
        return
      }

      const user = getUserData(sender, pushName)
      if (user.money < cost) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No tienes suficientes BrasCoins (tienes ¥${user.money.toLocaleString()})`,
        }, { quoted: msg }))
        return
      }

      const quantity  = cost / asset.price
      const positions = getUserPositions(sender)

      // Merge con posición existente del mismo activo
      const existIdx = positions.findIndex(p => p.symbol === asset.symbol)
      if (existIdx >= 0) {
        const ex   = positions[existIdx]!
        const newQ = ex.quantity + quantity
        const newC = ex.cost + cost
        positions[existIdx] = {
          symbol:   asset.symbol,
          quantity: newQ,
          buyPrice: newC / newQ,   // precio promedio ponderado
          buyAt:    ex.buyAt,
          cost:     newC,
        }
      } else {
        positions.push({ symbol: asset.symbol, quantity, buyPrice: asset.price, buyAt: Date.now(), cost })
      }

      setUserPositions(sender, positions)
      patchUserData(sender, { money: user.money - cost })

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `✅ *COMPRA EJECUTADA*`,
          ``,
          `  ${asset.emoji} *${asset.symbol}*  ¥${fmtPrice(asset.price)}`,
          `  Gastado:   ¥${cost.toLocaleString()}`,
          `  Unidades:  ${quantity.toFixed(6)} ${asset.symbol}`,
          ``,
          `§ *${prefix}portafolio* para ver tus posiciones`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── !vender <activo> <monto en BrasCoins o "todo"> ───────────────────
    if (cmd === 'vender') {
      const [symArg, amtArg] = args
      if (!symArg) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `\`${prefix}vender <activo> <¥|todo>\`\n\nEjemplo: \`${prefix}vender btc 300\`  o  \`${prefix}vender btc todo\``,
        }, { quoted: msg }))
        return
      }

      const asset = resolveSymbol(symArg)
      if (!asset) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Activo *${symArg.toUpperCase()}* no existe`,
        }, { quoted: msg }))
        return
      }

      const positions = getUserPositions(sender)
      const idx       = positions.findIndex(p => p.symbol === asset.symbol)
      if (idx < 0) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No tienes posición en *${asset.symbol}*`,
        }, { quoted: msg }))
        return
      }

      const pos      = positions[idx]!
      const curPrice = asset.price
      const totalVal = pos.quantity * curPrice
      const sellAll  = !amtArg || amtArg.toLowerCase() === 'todo'

      const sellCost = sellAll ? pos.cost : parseInt(amtArg ?? '0')
      if (!sellAll && (isNaN(sellCost) || sellCost < 1)) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Monto inválido`,
        }, { quoted: msg }))
        return
      }

      // Fracción a vender
      const fraction = sellAll ? 1 : Math.min(1, sellCost / pos.cost)
      const sellUnits = pos.quantity * fraction
      const sellValue = Math.round(sellUnits * curPrice)
      const sellPnl   = Math.round(sellValue - pos.cost * fraction)

      if (fraction >= 0.9999) {
        positions.splice(idx, 1)
      } else {
        positions[idx] = {
          ...pos,
          quantity: pos.quantity - sellUnits,
          cost:     pos.cost * (1 - fraction),
        }
      }

      setUserPositions(sender, positions)
      const user = getUserData(sender, pushName)
      patchUserData(sender, { money: user.money + sellValue })

      const pnlPct = (sellPnl / (pos.cost * fraction)) * 100

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `✅ *VENTA EJECUTADA*`,
          ``,
          `  ${asset.emoji} *${asset.symbol}*  ¥${fmtPrice(curPrice)}`,
          `  Cobrado:  ¥${sellValue.toLocaleString()}`,
          `  P&L:      ${trendArrow(sellPnl)} *${fmtPct(pnlPct)}* (${sellPnl >= 0 ? '+' : ''}¥${sellPnl})`,
          `  Balance:  ¥${(user.money + sellValue).toLocaleString()}`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── !cotizacion <activo> ─────────────────────────────────────────────
    const symArg = args[0]
    if (!symArg) {
      const overview = market.all().map(a => {
        const pct = market.change1h(a.symbol)
        return `  ${a.emoji} *${a.symbol.padEnd(5)}*  ¥${fmtPrice(a.price).padStart(9)}  ${trendArrow(pct)} ${fmtPct(pct)}`
      }).join('\n')

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `📊 *COTIZACIONES*`,
          ``,
          overview,
          ``,
          `§ *${prefix}cotizacion <activo>* para ver gráfico`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    const asset = resolveSymbol(symArg)
    if (!asset) {
      await safeSend(() => sock.sendMessage(jid, {
        text: `✗ Activo *${symArg.toUpperCase()}* no existe\n§ Disponibles: BTC · ETH · GOLD · SOL · WINSI · BRSCO`,
      }, { quoted: msg }))
      return
    }

    const chart = buildChart(asset.symbol)

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        chart,
        ``,
        `──────────────────────────────`,
        `§ *${prefix}invertir ${asset.symbol.toLowerCase()} <¥> sube [1m]*`,
        `§ *${prefix}comprar ${asset.symbol.toLowerCase()} <¥>*  — mantener`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
