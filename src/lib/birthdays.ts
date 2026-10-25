// Cuentas de fechas para #birthday. Lógica pura: se prueba desde
// scripts/stickers.test.js, con lo demás del lote.

/** Cuántos días faltan para el próximo 'DD/MM' (0 = hoy). Un 29/02 cae el
 *  1/03 en los años que no son bisiestos, como hace Date. */
export function diasHasta(birth: string, hoy = new Date()): number {
  const [d, m] = birth.split('/').map(Number)
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  let prox = new Date(hoy.getFullYear(), m! - 1, d!)
  if (prox < base) prox = new Date(hoy.getFullYear() + 1, m! - 1, d!)
  return Math.round((prox.getTime() - base.getTime()) / 86_400_000)
}
