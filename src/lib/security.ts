// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — SECURITY
//  Validación de entrada, detección de spam y lista de baneos en memoria.
//  No requiere dependencias externas — complementa rateLimiter.ts.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Ban list ─────────────────────────────────────────────────────────────────

const _banned = new Set<string>()

export function banUser(jid: string): void    { _banned.add(jid) }
export function unbanUser(jid: string): void  { _banned.delete(jid) }
export function isBanned(jid: string): boolean { return _banned.has(jid) }
export function getBanned(): string[]          { return [..._banned] }
export function clearBans(): void              { _banned.clear() }

// ─── Spam detection ───────────────────────────────────────────────────────────

interface SpamEntry { count: number; first: number }
const _spam = new Map<string, SpamEntry>()

/**
 * Registra un mensaje del JID y determina si supera el umbral.
 * Ventana deslizante: si `windowMs` ha pasado desde el primer mensaje, reinicia.
 */
export function detectSpam(
  jid:       string,
  threshold  = 5,
  windowMs   = 5_000,
): { isSpam: boolean; count: number } {
  const now   = Date.now()
  const entry = _spam.get(jid)

  if (!entry || now - entry.first > windowMs) {
    _spam.set(jid, { count: 1, first: now })
    return { isSpam: false, count: 1 }
  }

  entry.count++
  return { isSpam: entry.count >= threshold, count: entry.count }
}

export function resetSpam(jid: string): void { _spam.delete(jid) }
export function clearSpamMap(): void          { _spam.clear() }

// ─── Per-JID incoming rate gate ───────────────────────────────────────────────

interface RateEntry { count: number; windowStart: number }
const _rateMap = new Map<string, RateEntry>()

/**
 * Retorna `true` si el JID supera `limit` mensajes en `windowMs`.
 * Diseñado para mensajes *entrantes* (el rateLimiter cubre los salientes).
 */
export function isRateLimited(
  jid:     string,
  limit    = 10,
  windowMs = 10_000,
): boolean {
  const now = Date.now()
  const r   = _rateMap.get(jid)
  if (!r || now - r.windowStart > windowMs) {
    _rateMap.set(jid, { count: 1, windowStart: now })
    return false
  }
  r.count++
  return r.count > limit
}

// ─── Input validation ─────────────────────────────────────────────────────────

const SQL_RE    = /('|--|;|\/\*|\*\/|xp_|\bUNION\b|\bSELECT\b|\bINSERT\b|\bDROP\b|\bDELETE\b|\bUPDATE\b)/gi
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi

export function validateInput(text: string): { safe: boolean; reason?: string } {
  if (typeof text !== 'string') return { safe: false, reason: 'not a string' }
  if (text.length > 4_000)     return { safe: false, reason: 'too long' }
  if (SCRIPT_RE.test(text))    return { safe: false, reason: 'script injection' }
  if (SQL_RE.test(text))       return { safe: false, reason: 'sql-like pattern' }
  return { safe: true }
}

/** Elimina etiquetas HTML y caracteres peligrosos para uso en comandos. */
export function sanitizeCommand(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[&<>"'`\\]/g, '')
    .trim()
    .slice(0, 200)
}

// ─── Cleanup periódico ────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now()
  for (const [jid, e] of _spam)    if (now - e.first        > 60_000) _spam.delete(jid)
  for (const [jid, r] of _rateMap) if (now - r.windowStart  > 60_000) _rateMap.delete(jid)
}, 60_000).unref()
