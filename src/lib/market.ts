/// market.ts — Motor de mercado RPG
///
/// Precio simulado con random walk (Box-Muller) por activo.
/// Tick cada 60s; historial de 60 ticks (= 1h de datos).
/// Exporta el singleton `market` y helpers de formato.

export interface AssetDef {
  symbol:     string
  name:       string
  emoji:      string
  basePrice:  number
  volatility: number  // desviación estándar por tick (fracción)
}

export interface AssetState extends AssetDef {
  price:     number
  history:   number[]   // últimos 60 precios (tick más reciente = último)
}

// ─── Activos disponibles ───────────────────────────────────────────────────────

export const ASSETS: AssetDef[] = [
  { symbol: 'BTC',   name: 'Bitcoin WA',    emoji: '₿',  basePrice: 105_000, volatility: 0.022 },
  { symbol: 'ETH',   name: 'Ethereum WA',   emoji: 'Ξ',  basePrice: 3_500,   volatility: 0.025 },
  { symbol: 'GOLD',  name: 'Gold WA',       emoji: '🥇', basePrice: 2_400,   volatility: 0.008 },
  { symbol: 'SOL',   name: 'Solana WA',     emoji: '◎',  basePrice: 180,     volatility: 0.032 },
  { symbol: 'WINSI', name: 'WinsiCoin',     emoji: '★',  basePrice: 500,     volatility: 0.045 },
  { symbol: 'BRSCO', name: 'BrasCoin Mkt',  emoji: '¥',  basePrice: 10,      volatility: 0.060 },
]

const TICK_MS    = 60_000
const HISTORY    = 60   // 1h de datos
const SPARK_LEN  = 16   // puntos en sparkline

// ─── Gaussian normal (Box-Muller) ─────────────────────────────────────────────

function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ─── Motor ────────────────────────────────────────────────────────────────────

class MarketEngine {
  private state = new Map<string, AssetState>()
  private timer?: NodeJS.Timeout

  constructor() {
    for (const def of ASSETS) {
      this.state.set(def.symbol, {
        ...def,
        price:   def.basePrice,
        history: Array(HISTORY).fill(def.basePrice),
      })
    }
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private tick(): void {
    for (const asset of this.state.values()) {
      const change   = 1 + asset.volatility * randn()
      asset.price    = Math.max(asset.price * change, 0.0001)
      asset.history  = [...asset.history.slice(-(HISTORY - 1)), asset.price]
    }
  }

  get(symbol: string): AssetState | undefined {
    return this.state.get(symbol.toUpperCase())
  }

  all(): AssetState[] {
    return [...this.state.values()]
  }

  /** % de cambio en la última hora */
  change1h(symbol: string): number {
    const a = this.state.get(symbol.toUpperCase())
    if (!a || a.history.length < 2) return 0
    const old = a.history[0]!
    return ((a.price - old) / old) * 100
  }

  /** % de cambio respecto al tick anterior */
  changePrev(symbol: string): number {
    const a = this.state.get(symbol.toUpperCase())
    if (!a || a.history.length < 2) return 0
    const prev = a.history[a.history.length - 2]!
    return ((a.price - prev) / prev) * 100
  }

  /** Sparkline de últimos N ticks */
  spark(symbol: string, len = SPARK_LEN): string {
    const a = this.state.get(symbol.toUpperCase())
    if (!a) return ''
    const slice  = a.history.slice(-len)
    const min    = Math.min(...slice)
    const max    = Math.max(...slice)
    const range  = max - min || 1
    const blocks = ['▁','▂','▃','▄','▅','▆','▇','█']
    return slice.map(p => blocks[Math.min(7, Math.floor(((p - min) / range) * 7))]!).join('')
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }
}

export const market = new MarketEngine()

// ─── Formato ──────────────────────────────────────────────────────────────────

export function fmtPrice(price: number): string {
  if (price >= 1_000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (price >= 1)     return price.toFixed(2)
  return price.toFixed(4)
}

export function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function trendArrow(pct: number): string {
  return pct > 0 ? '📈' : pct < 0 ? '📉' : '➡️'
}

export function resolveSymbol(input: string): AssetState | null {
  return market.get(input.toUpperCase()) ?? null
}

export const TIMEFRAMES: Record<string, number> = {
  '30s': 30_000,
  '1m':  60_000,
  '3m':  180_000,
  '5m':  300_000,
}
