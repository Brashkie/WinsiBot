// "Cuándo" en lenguaje de chat → un instante. Lo usa #recordar.
//
// Sin dependencias a propósito: es lógica pura y se prueba directo desde
// scripts/reminders.test.js. Entiende:
//
//   10m · 2h · 1d · 1h30m · 90min       (duraciones compactas)
//   en 10 minutos · 2 horas · 3 días    (duraciones en palabras)
//   18:30 · a las 18:30 · hoy 18:30     (hoy; si ya pasó, mañana)
//   mañana 9:00 · mañana                (mañana a esa hora / en 24 h)

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

const UNIDAD: Record<string, number> = {
  m: MIN, min: MIN, mins: MIN, minuto: MIN, minutos: MIN,
  h: HORA, hr: HORA, hrs: HORA, hora: HORA, horas: HORA,
  d: DIA, dia: DIA, dias: DIA, 'día': DIA, 'días': DIA,
  // Sin "s": "30s" se leería como 30 semanas, no 30 segundos.
  sem: DIA * 7, semana: DIA * 7, semanas: DIA * 7,
}

/** "1h30m", "90min", "2d" → ms; null si no es una duración compacta. */
function compacta(tok: string): number | null {
  const partes = [...tok.matchAll(/(\d+)([a-zá]+)/g)]
  if (!partes.length || partes.map(p => p[0]).join('') !== tok) return null
  let ms = 0
  for (const [, n, u] of partes) {
    const f = UNIDAD[u!]
    if (!f) return null
    ms += parseInt(n!) * f
  }
  return ms
}

function horaMinuto(tok: string): [number, number] | null {
  const m = tok.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
  if (!m || (m[2] === undefined && m[3] === undefined)) return null
  let h = parseInt(m[1]!)
  const min = m[2] ? parseInt(m[2]) : 0
  if (m[3]) {
    if (h < 1 || h > 12) return null
    if (m[3] === 'pm' && h !== 12) h += 12
    if (m[3] === 'am' && h === 12) h = 0
  }
  if (h > 23 || min > 59) return null
  return [h, min]
}

export interface Cuando {
  /** El instante, en ms. */
  at:    number
  /** Lo que queda del texto: el recordatorio en sí. */
  resto: string
}

export function parsearCuando(texto: string, ahora: Date = new Date()): Cuando | null {
  const toks = texto.trim().split(/\s+/).filter(Boolean)
  const low = toks.map(t => t.toLowerCase())
  let i = 0
  const t0 = ahora.getTime()

  if (low[i] === 'en') i++

  // Duración: "10m" / "1h30m"
  const c = low[i] ? compacta(low[i]!) : null
  if (c) return armar(t0 + c, toks, i + 1)

  // Duración en palabras: "10 minutos", "2 horas"
  if (low[i] && /^\d+$/.test(low[i]!) && low[i + 1] && UNIDAD[low[i + 1]!]) {
    return armar(t0 + parseInt(low[i]!) * UNIDAD[low[i + 1]!]!, toks, i + 2)
  }

  // Hora del día: [hoy|mañana] [a las] HH:MM
  let manana = false
  if (low[i] === 'hoy') i++
  else if (low[i] === 'mañana' || low[i] === 'manana') { manana = true; i++ }
  if (low[i] === 'a' && (low[i + 1] === 'las' || low[i + 1] === 'la')) i += 2

  const hm = low[i] ? horaMinuto(low[i]!) : null
  if (hm) {
    const d = new Date(ahora)
    d.setHours(hm[0], hm[1], 0, 0)
    if (manana) d.setDate(d.getDate() + 1)
    else if (d.getTime() <= t0) d.setDate(d.getDate() + 1)
    return armar(d.getTime(), toks, i + 1)
  }

  // "mañana" a secas: dentro de 24 h.
  if (manana) return armar(t0 + DIA, toks, i)

  return null
}

function armar(at: number, toks: string[], desde: number): Cuando | null {
  const resto = toks.slice(desde).join(' ').trim()
  return resto ? { at, resto } : null
}

/** "en 2 h 5 min", para confirmarle al usuario lo que entendió el bot. */
export function falta(ms: number): string {
  if (ms < MIN) return 'menos de un minuto'
  const d = Math.floor(ms / DIA)
  const h = Math.floor((ms % DIA) / HORA)
  const m = Math.floor((ms % HORA) / MIN)
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
}
