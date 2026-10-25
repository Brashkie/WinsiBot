// Las listas para partidas por equipos (#lista), como las que arman los grupos
// de Free Fire: dos equipos de N y suplentes. Lógica pura, sin estado ni
// WhatsApp: el comando guarda las listas y esto decide dónde va cada uno. Se
// prueba en scripts/lineup.test.js.

export const FORMATOS = [4, 6, 12, 16, 20, 24] as const
export type Equipo = 'A' | 'B' | 'S'   // S: suplentes

export interface Lista {
  titulo:   string
  porEquipo: number
  A:        string[]
  B:        string[]
  S:        string[]
  creador:  string
  creada:   number
}

/** "4vs4", "4v4" o "4" → 4, si es un formato válido. */
export function formatoDe(tok: string): number | null {
  const m = tok.toLowerCase().match(/^(\d{1,2})(?:v(?:s)?(\d{1,2}))?$/)
  if (!m) return null
  const n = parseInt(m[1]!)
  if (m[2] && parseInt(m[2]) !== n) return null
  return (FORMATOS as readonly number[]).includes(n) ? n : null
}

export const maxSuplentes = (porEquipo: number) => Math.max(2, Math.ceil(porEquipo / 2))

export function nueva(titulo: string, porEquipo: number, creador: string): Lista {
  return { titulo, porEquipo, A: [], B: [], S: [], creador, creada: Date.now() }
}

export const dondeEsta = (l: Lista, jid: string): Equipo | null =>
  l.A.includes(jid) ? 'A' : l.B.includes(jid) ? 'B' : l.S.includes(jid) ? 'S' : null

export type Resultado = { ok: true; equipo: Equipo } | { ok: false; motivo: 'llena' | 'equipo-lleno' }

/**
 * Anota a `jid`. Sin equipo pedido, va al que tenga menos (A si empatan); si
 * los dos están llenos, a suplentes. Pedir un equipo lleno no lo manda a otro:
 * se avisa. Si ya estaba, se cambia de lugar.
 */
export function unir(l: Lista, jid: string, pedido?: Equipo): Resultado {
  const antes = dondeEsta(l, jid)
  const sin = (e: Equipo) => l[e].filter(x => x !== jid)
  const cupo = (e: Equipo) => (e === 'S' ? maxSuplentes(l.porEquipo) : l.porEquipo) - sin(e).length

  let destino: Equipo
  if (pedido) {
    if (cupo(pedido) <= 0) return { ok: false, motivo: 'equipo-lleno' }
    destino = pedido
  } else if (antes) {
    return { ok: true, equipo: antes }
  } else if (cupo('A') > 0 || cupo('B') > 0) {
    destino = cupo('A') >= cupo('B') ? 'A' : 'B'
  } else if (cupo('S') > 0) {
    destino = 'S'
  } else {
    return { ok: false, motivo: 'llena' }
  }
  for (const e of ['A', 'B', 'S'] as const) l[e] = sin(e)
  l[destino].push(jid)
  return { ok: true, equipo: destino }
}

/** Saca a `jid`. Si deja un hueco en un equipo, sube el primer suplente. */
export function salir(l: Lista, jid: string): { salio: boolean; subio: string | null } {
  const e = dondeEsta(l, jid)
  if (!e) return { salio: false, subio: null }
  l[e] = l[e].filter(x => x !== jid)
  let subio: string | null = null
  if (e !== 'S' && l.S.length) {
    subio = l.S.shift()!
    l[e].push(subio)
  }
  return { salio: true, subio }
}

export const MAPAS = ['Bermuda', 'Purgatorio', 'Kalahari', 'Alpes', 'Nexterra', 'Bermuda Remasterizado'] as const
