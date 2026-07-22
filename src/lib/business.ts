// business.ts — Catálogo de negocios comprables (#business) + ingreso pasivo (#collect)

export interface BusinessDef {
  id:         string
  name:       string
  emoji:      string
  cost:       number
  hourlyRate: number   // BrasCoins por hora acumulados
  tier:       'negocio' | 'empresa'
}

export const BUSINESSES: BusinessDef[] = [
  { id: 'farm',       name: 'Granja',      emoji: '🌽', cost: 5_000,      hourlyRate: 120,    tier: 'negocio' },
  { id: 'bakery',     name: 'Panadería',   emoji: '🥖', cost: 15_000,     hourlyRate: 320,    tier: 'negocio' },
  { id: 'store',      name: 'Tienda',      emoji: '🏪', cost: 40_000,     hourlyRate: 800,    tier: 'negocio' },
  { id: 'restaurant', name: 'Restaurante', emoji: '🍔', cost: 150_000,    hourlyRate: 2_800,  tier: 'empresa' },
  { id: 'hotel',      name: 'Hotel',       emoji: '🏨', cost: 500_000,    hourlyRate: 9_000,  tier: 'empresa' },
  { id: 'factory',    name: 'Fábrica',     emoji: '🏭', cost: 1_200_000,  hourlyRate: 22_000, tier: 'empresa' },
]

export function findBusiness(id: string): BusinessDef | undefined {
  const needle = id.toLowerCase()
  return BUSINESSES.find(b => b.id === needle || b.name.toLowerCase() === needle)
}

// Tope de horas acumulables sin recolectar — evita que alguien deje el
// negocio "juntando" indefinidamente sin conectarse (fomenta volver seguido,
// mismo criterio que el resto del RPG con cooldowns diarios).
export const MAX_ACCUMULATION_HOURS = 24

export function pendingIncome(hourlyRate: number, lastCollect: number): number {
  const hoursElapsed = Math.min(
    MAX_ACCUMULATION_HOURS,
    (Date.now() - lastCollect) / (60 * 60_000),
  )
  return Math.floor(hoursElapsed * hourlyRate)
}
