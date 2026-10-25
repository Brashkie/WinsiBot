// "Asesino en el chat": las reglas, sin estado ni WhatsApp. La usa #asesino y
// se prueba desde scripts/killer.test.js.
//
// Entre 4 y 10 jugadores. Uno es el asesino (dos desde 8), uno el detective,
// uno el médico (desde 5), y el resto ciudadanos; cada uno se entera del suyo
// por privado. De NOCHE el asesino elige a quién matar, el médico a quién
// salvar y el detective a quién investigar, todo por privado. De DÍA el grupo
// debate y vota a quién expulsar, en público. Gana el pueblo si no quedan
// asesinos; ganan los asesinos si son tantos como el resto.
//
// A los jugadores se los nombra por su ASIENTO (1, 2, 3…), fijo toda la
// partida: si los números se corrieran al morir alguien, "voto al 3" no
// significaría lo mismo en dos mensajes seguidos.

export type Rol = 'asesino' | 'detective' | 'medico' | 'ciudadano'

export const MIN_JUGADORES = 4
export const MAX_JUGADORES = 10

export const NOMBRE_ROL: Record<Rol, string> = {
  asesino:   '🔪 Asesino',
  detective: '🔍 Detective',
  medico:    '🩺 Médico',
  ciudadano: '🧑 Ciudadano',
}

/** Los roles para `n` jugadores, mezclados: roles[asiento - 1]. */
export function repartir(n: number, azar: () => number = Math.random): Rol[] {
  const roles: Rol[] = []
  const asesinos = n >= 8 ? 2 : 1
  for (let i = 0; i < asesinos; i++) roles.push('asesino')
  roles.push('detective')
  if (n >= 5) roles.push('medico')
  while (roles.length < n) roles.push('ciudadano')
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j]!, roles[i]!]
  }
  return roles
}

/**
 * Quién muere esta noche. Con dos asesinos que eligen distinto, decide el
 * azar entre los dos. Si el médico salvó a ese, no muere nadie.
 */
export function resolverNoche(
  elecciones: number[],
  salvado: number | null,
  azar: () => number = Math.random,
): number | null {
  if (!elecciones.length) return null
  const victima = elecciones[Math.floor(azar() * elecciones.length)]!
  return victima === salvado ? null : victima
}

/**
 * El expulsado del día: el más votado, si tiene más votos que cualquier otro
 * y más que los que votaron no expulsar a nadie (voto 0). Empate: nadie.
 */
export function contarVotos(votos: Map<number, number>): { expulsado: number | null; conteo: Map<number, number> } {
  const conteo = new Map<number, number>()
  for (const v of votos.values()) conteo.set(v, (conteo.get(v) ?? 0) + 1)
  let max = 0
  let quien: number | null = null
  let empate = false
  for (const [asiento, n] of conteo) {
    if (n > max) { max = n; quien = asiento; empate = false }
    else if (n === max) empate = true
  }
  return { expulsado: empate || quien === 0 ? null : quien, conteo }
}

/** `null` mientras la partida sigue. */
export function ganador(roles: Rol[], vivos: Set<number>): 'pueblo' | 'asesinos' | null {
  let asesinos = 0
  let otros = 0
  for (const a of vivos) {
    if (roles[a - 1] === 'asesino') asesinos++
    else otros++
  }
  if (asesinos === 0) return 'pueblo'
  if (asesinos >= otros) return 'asesinos'
  return null
}

/** El médico no puede salvar a la misma persona dos noches seguidas. */
export const puedeSalvar = (objetivo: number, anterior: number | null) => objetivo !== anterior
