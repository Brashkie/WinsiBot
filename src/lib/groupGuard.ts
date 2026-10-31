// La parte pura del antirrobo de grupos: describir el evento como lo pide la
// decisión, que está en Ada/SPARK dentro de la Session API
// (crates/session-api/ada/src/group_guard.ads), y nombrar lo que devuelve.
// Sin Baileys ni red, para poder probarla; lo que habla con WhatsApp está en
// core/events/antitheft.ts.

/** Las acciones, como bits: lo que devuelve /group/guard/decide. */
export const DEGRADAR_AUTOR = 1
export const RESTAURAR_AFECTADO = 2
export const REVOCAR_ENLACE = 4
export const AVISAR_DUENO = 8

/** Un bit por campo del record `Event` de Ada, en el mismo orden. */
export const BANDERA = {
  activo: 1 << 0,
  autorConocido: 1 << 1,
  autorProtegido: 1 << 2,
  autorEsBot: 1 << 3,
  autorEsAfectado: 1 << 4,
  afectadoProtegido: 1 << 5,
  afectadoEsBot: 1 << 6,
  botEsAdmin: 1 << 7,
} as const

/** Lo que Baileys da de cada participante: `id` puede ser el número o el @lid. */
export interface Participante {
  id: string
  lid?: string | undefined
  jid?: string | undefined
}

/** El jid sin el dispositivo: `51999:12@s.whatsapp.net` → `51999@s.whatsapp.net`. */
export function normalizar(jid: string): string {
  return jid.trim().toLowerCase().replace(/:\d+@/, '@')
}

/**
 * Todos los nombres con que WhatsApp conoce a esa persona en el grupo. En los
 * grupos con @lid, el mismo admin llega como `123@lid` en un evento y como
 * `51999@s.whatsapp.net` en la lista de protegidos: comparar solo el texto
 * dejaría pasar justo al que hay que proteger.
 */
export function aliasDe(jid: string, participantes: readonly Participante[]): string[] {
  const n = normalizar(jid)
  const todos = new Set([n])
  const p = participantes.find((x) => [x.id, x.lid, x.jid].some((a) => a && normalizar(a) === n))
  if (p) for (const a of [p.id, p.lid, p.jid]) if (a) todos.add(normalizar(a))
  return [...todos]
}

export function esLaMisma(
  a: string | undefined,
  b: string | undefined,
  participantes: readonly Participante[],
): boolean {
  if (!a || !b) return false
  const deB = new Set(aliasDe(b, participantes))
  return aliasDe(a, participantes).some((x) => deB.has(x))
}

/** `tipo` de Ada: 0 ascenso, 1 degradación, 2 expulsión; -1 lo demás. */
export function tipoDe(action: string): number {
  return action === 'promote' ? 0 : action === 'demote' ? 1 : action === 'remove' ? 2 : -1
}

export interface Evento {
  activo: boolean
  /** Quién lo hizo. Baileys lo trae vacío a veces: entonces no se actúa. */
  autor: string | undefined
  afectado: string
  protegidos: readonly string[]
  /** El bot, con su número y su @lid. */
  bot: readonly string[]
  botEsAdmin: boolean
}

export function banderas(e: Evento, participantes: readonly Participante[]): number {
  const entre = (x: string, lista: readonly string[]) =>
    lista.some((y) => esLaMisma(x, y, participantes))
  let f = 0
  if (e.activo) f |= BANDERA.activo
  if (e.autor) {
    f |= BANDERA.autorConocido
    if (entre(e.autor, e.protegidos)) f |= BANDERA.autorProtegido
    if (entre(e.autor, e.bot)) f |= BANDERA.autorEsBot
    if (esLaMisma(e.autor, e.afectado, participantes)) f |= BANDERA.autorEsAfectado
  }
  if (entre(e.afectado, e.protegidos)) f |= BANDERA.afectadoProtegido
  if (entre(e.afectado, e.bot)) f |= BANDERA.afectadoEsBot
  if (e.botEsAdmin) f |= BANDERA.botEsAdmin
  return f
}

/** Cuántos protegidos puede marcar un grupo, además del creador y los dueños del bot. */
export const MAX_PROTEGIDOS = 10
