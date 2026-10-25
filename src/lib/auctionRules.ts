// Las reglas de las subastas, sin estado: las usa auctions.ts y se prueban
// desde scripts/auction.test.js.

export const COMISION   = 0.05          // lo que se queda la casa: saca dinero de la economía
export const MIN_MINUTOS = 5
export const MAX_MINUTOS = 120
export const ANTI_ULTIMO = 60_000       // pujar en el último minuto lo alarga un minuto

/** La puja mínima: la base si no hay pujas; si hay, +5% (al menos ¥50). */
export function pujaMinima(base: number, actual: number | null): number {
  if (actual === null) return base
  return actual + Math.max(50, Math.ceil(actual * 0.05))
}

/**
 * Cuándo termina después de una puja en `ahora`. Pujar en el último minuto
 * lo alarga hasta un minuto desde la puja: sin esto gana el que puja en el
 * último segundo, no el que más ofrece.
 */
export function alargar(termina: number, ahora: number): number {
  return termina - ahora < ANTI_ULTIMO ? ahora + ANTI_ULTIMO : termina
}

/** Lo que recibe el vendedor. */
export const neto = (monto: number) => monto - Math.floor(monto * COMISION)

/** Los ítems que se pueden subastar: clave en `UserData.items` → nombre. */
export const ITEMS: Record<string, { clave: 'sword' | 'spada' | 'pc' | 'sp' | 'legendary'; nombre: string }> = {
  espada:      { clave: 'sword',     nombre: '⚔️ Espada' },
  espadas:     { clave: 'sword',     nombre: '⚔️ Espada' },
  proteccion:  { clave: 'spada',     nombre: '🛡️ Piedra de protección' },
  'protección': { clave: 'spada',    nombre: '🛡️ Piedra de protección' },
  pocion:      { clave: 'pc',        nombre: '🧪 Poción' },
  'poción':    { clave: 'pc',        nombre: '🧪 Poción' },
  sp:          { clave: 'sp',        nombre: '✨ SP' },
  legendario:  { clave: 'legendary', nombre: '🏆 Legendario' },
  legendarios: { clave: 'legendary', nombre: '🏆 Legendario' },
}
