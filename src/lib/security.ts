import { analyzeIntent, checkSpamText, warnUser as _warnUserAPI } from './pythonBridge.js'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — SECURITY
//  Ban list, detección de spam/contenido vía Rust NLP + Python, validación.
//  L1 = in-memory (sub-ms) → L2 = Rust NLP (< 1ms) → L3 = Python Cython.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Ban list (in-memory L1) ──────────────────────────────────────────────────

const _banned = new Set<string>()

export function banUser(jid: string): void     { _banned.add(jid) }
export function unbanUser(jid: string): void   { _banned.delete(jid) }
export function isBanned(jid: string): boolean { return _banned.has(jid) }
export function getBanned(): string[]          { return [..._banned] }
export function clearBans(): void              { _banned.clear() }

// ─── Content analysis (Rust NLP → Python → local regex) ──────────────────────

export type ContentIntent =
  | 'spam' | 'insult' | 'nsfw' | 'command_attempt'
  | 'greeting' | 'farewell' | 'nonsense' | 'neutral' | 'unknown'

export interface ContentCheck {
  intent:     ContentIntent
  confidence: number
  isSafe:     boolean
  isSpam:     boolean
  method:     'rust' | 'python' | 'local'
}

const UNSAFE = new Set<ContentIntent>(['spam', 'insult', 'nsfw', 'nonsense'])

/**
 * Analiza el contenido de un mensaje.
 * Rust NLP (regexes compiladas, sub-ms) → Python ML → regex local como fallback.
 */
export async function analyzeContent(text: string): Promise<ContentCheck> {
  try {
    const r = await analyzeIntent(text)
    if (r) {
      const intent    = r.primary as ContentIntent
      const isSafe    = !UNSAFE.has(intent)
      const method: 'rust' | 'python' = intent === 'unknown' ? 'python' : 'rust'
      return { intent, confidence: 0.92, isSafe, isSpam: intent === 'spam', method }
    }
  } catch {}
  return _localCheck(text)
}

/**
 * Verificación profunda de spam usando Python/Cython.
 * Más precisa, usar en mensajes largos o cuando analyzeContent es insuficiente.
 */
export async function deepCheckSpam(text: string): Promise<boolean> {
  try { return await checkSpamText(text) } catch { return false }
}

/**
 * Registrar advertencia en Python (persiste entre reinicios del bot).
 * Retorna el nuevo total de warns del usuario.
 */
export async function warnUserPersisted(jid: string): Promise<number> {
  try { return await _warnUserAPI(jid) } catch { return 0 }
}

// ─── Spam detection (sliding window, in-memory) ───────────────────────────────

interface SpamEntry { count: number; first: number }
const _spam = new Map<string, SpamEntry>()

/**
 * Registra un mensaje del JID y determina si supera el umbral.
 * Ventana deslizante: si `windowMs` pasó desde el primer mensaje, reinicia.
 */
export function detectSpam(
  jid:      string,
  threshold = 5,
  windowMs  = 5_000,
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
 * Cubre mensajes *entrantes*; rateLimiter.ts cubre los salientes.
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

// ─── Local regex fallback (sin red) ──────────────────────────────────────────

const _SPAM_RE   = /(.)\1{7,}/
const _CMD_RE    = /^[!#./]\w+/
const _INSULT_RE = /\b(mierda|idiota|estupido|inutil|pendejo|hdp|ctm|puta|basura|malparido)\b/i
const _NSFW_RE   = /\b(nsfw|adulto|porn|xxx|desnud|hentai|erotico)\b/i

function _localCheck(text: string): ContentCheck {
  const t = text.trim()
  let intent: ContentIntent = 'neutral'
  if (_SPAM_RE.test(t))   intent = 'spam'
  else if (_CMD_RE.test(t))    intent = 'command_attempt'
  else if (_INSULT_RE.test(t)) intent = 'insult'
  else if (_NSFW_RE.test(t))   intent = 'nsfw'
  const isSafe = !UNSAFE.has(intent)
  return { intent, confidence: 0.75, isSafe, isSpam: intent === 'spam', method: 'local' }
}

// ─── Cleanup periódico ────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now()
  for (const [jid, e] of _spam)    if (now - e.first       > 60_000) _spam.delete(jid)
  for (const [jid, r] of _rateMap) if (now - r.windowStart > 60_000) _rateMap.delete(jid)
}, 60_000).unref()
