// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — los números de WhatsApp de la gente
//
//  WhatsApp esconde los números en los grupos con LID; el bot sabe a qué
//  número corresponde cada LID (ver core/store.ts). Si el bot lo escribe —un
//  comando que lo muestra, la IA que lo repite del historial— rompe esa
//  privacidad. Por eso todo lo que sale pasa por acá (ver core/egress.ts):
//  un número que es de alguien se tapa, `51924360740` → `51••••••740`.
//
//  Quién encuentra y tapa es Ada/SPARK, en la Session API
//  (crates/session-api/ada/src/phone_guard.ads), con la garantía demostrada
//  de que lo tapado deja ver solo los dos primeros y los tres últimos
//  dígitos; los números vienen en la misma respuesta del turno del antiban.
//  Esta es la copia para cuando la Session API no contesta, y da lo mismo:
//  scripts/phone_guard.test.js la compara con los casos que genera Rust.
//
//  Qué se tapa lo decide el bot y no la regla: "10000000000 monedas" también
//  parece un número. Solo se tapa uno que el bot conoce como de alguien —un
//  contacto, un miembro de un grupo, alguien que escribió—.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_DIGITOS = 6
export const MAX_DIGITOS = 20

export interface Numero {
  /** Posición en el texto, en unidades UTF-16 (como cuenta JavaScript). */
  ini:     number
  /** Exclusiva. */
  fin:     number
  digitos: string
  tapado:  string
}

export type TipoJid = 'numero' | 'lid' | 'grupo' | 'otro'

const dig   = (c: number) => c >= 48 && c <= 57
const alnum = (c: number) => dig(c) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
// Espacio, guion, punto y paréntesis.
const sep   = (c: number) => c === 32 || c === 45 || c === 46 || c === 40 || c === 41
const MAS   = 43

/** `51924360740` → `51••••••740`; `null` si no son de 6 a 20 dígitos. */
export function enmascarar(digitos: string): string | null {
  const m = digitos.length
  if (m < MIN_DIGITOS || m > MAX_DIGITOS) return null
  for (let i = 0; i < m; i++) if (!dig(digitos.charCodeAt(i))) return null
  return digitos.slice(0, 2) + '•'.repeat(m - 5) + digitos.slice(m - 3)
}

/** Todos los números de un texto (la misma regla que Phone_Guard.Buscar_C). */
export function buscarNumeros(t: string): Numero[] {
  const out: Numero[] = []
  const l = t.length
  let desde = 0
  let i = 0
  while (i < l) {
    if (dig(t.charCodeAt(i)) && (i === 0 || !alnum(t.charCodeAt(i - 1)))) {
      let j = i + 1
      let f = i
      let d = 1
      while (j < l) {
        const c = t.charCodeAt(j)
        if (dig(c)) {
          d++
          f = j
        } else if (sep(c) && ((j + 1 < l && dig(t.charCodeAt(j + 1))) ||
                              (j + 2 < l && sep(t.charCodeAt(j + 1)) && dig(t.charCodeAt(j + 2))))) {
          // un separador entre dígitos
        } else {
          break
        }
        j++
      }
      if (d >= MIN_DIGITOS && d <= MAX_DIGITOS && (f === l - 1 || !alnum(t.charCodeAt(f + 1)))) {
        const ini = i > desde && t.charCodeAt(i - 1) === MAS ? i - 1 : i
        const digitos = t.slice(ini, f + 1).replace(/\D/g, '')
        out.push({ ini, fin: f + 1, digitos, tapado: enmascarar(digitos)! })
        desde = f + 1
      }
      i = f + 1
    } else {
      i++
    }
  }
  return out
}

/** De qué es un JID y su número (la misma regla que Phone_Guard.Leer_Jid_C). */
export function leerJid(jid: string): { tipo: TipoJid; numero: string } | null {
  const l = jid.length
  if (l < 1 || l > 128) return null
  let k = 0
  while (k < l && k < MAX_DIGITOS && dig(jid.charCodeAt(k))) k++
  if (k === 0 || k >= l || (jid[k] !== ':' && jid[k] !== '@')) return null
  let a = k
  if (jid[a] === ':') {
    a++
    while (a < l && dig(jid.charCodeAt(a))) a++
    if (a >= l || jid[a] !== '@') return null
  }
  const servidor = jid.slice(a + 1)
  const tipo: TipoJid | null =
    servidor === 's.whatsapp.net' || servidor === 'c.us' ? 'numero'
    : servidor === 'lid'  ? 'lid'
    : servidor === 'g.us' ? 'grupo'
    : servidor === ''     ? null
    : 'otro'
  return tipo ? { tipo, numero: jid.slice(0, k) } : null
}

// ─── Los números que son de alguien ──────────────────────────────────────────

const conocidos = new Set<string>()

/** Anotar el número de un JID de persona (número o LID). Los grupos no. */
export function conocer(jid: string | null | undefined): void {
  if (!jid) return
  const j = leerJid(jid)
  if (j && (j.tipo === 'numero' || j.tipo === 'lid')) conocidos.add(j.numero)
}

/** Para los tests. */
export function olvidarConocidos(): void {
  conocidos.clear()
}

/**
 * El texto con los números conocidos tapados, salvo los de `permitidos` (el
 * de quien recibe un privado, los mencionados de verdad). `numeros` es lo que
 * devolvió la Session API; sin ella, se buscan acá.
 */
export function tapar(texto: string, numeros: readonly Numero[] | null, permitidos: ReadonlySet<string>): string {
  const ns = numeros ?? buscarNumeros(texto)
  let out = texto
  // De atrás hacia adelante, para que las posiciones sigan valiendo.
  for (let k = ns.length - 1; k >= 0; k--) {
    const n = ns[k]!
    if (!conocidos.has(n.digitos) || permitidos.has(n.digitos)) continue
    if (n.ini < 0 || n.fin > out.length || n.ini >= n.fin) continue
    out = out.slice(0, n.ini) + n.tapado + out.slice(n.fin)
  }
  return out
}

// ─── Para el log ─────────────────────────────────────────────────────────────

// Se lee la primera vez que hace falta, no al importar: este módulo puede
// cargarse antes que el .env.
let completo: boolean | null = null
const numerosCompletos = () => (completo ??= process.env.LOG_NUMEROS === 'completo')

/** Para los tests. */
export function logNumerosCompletos(si: boolean): void {
  completo = si
}

/**
 * Un JID para el log: `51924360740@s.whatsapp.net` → `51••••••740@s.whatsapp.net`.
 * Los grupos y lo que no es un JID quedan igual. Con `LOG_NUMEROS=completo`,
 * todo igual: para depurar.
 */
export function jidParaLog(jid: string): string {
  if (numerosCompletos() || !jid) return jid
  const j = leerJid(jid)
  if (!j || (j.tipo !== 'numero' && j.tipo !== 'lid')) return jid
  return (enmascarar(j.numero) ?? j.numero) + jid.slice(j.numero.length)
}

/**
 * Un texto para el log, con los números conocidos tapados: como lo que sale
 * del bot. Un monto o un código no se tocan.
 */
export function textoParaLog(texto: string): string {
  if (numerosCompletos() || !texto) return texto
  return tapar(texto, null, SIN_PERMITIDOS)
}

const SIN_PERMITIDOS: ReadonlySet<string> = new Set()
