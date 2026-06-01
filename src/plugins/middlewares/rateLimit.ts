import type { BotContext } from '../../types/index.js'
import { pythonPost } from '@lib/pythonBridge.js'
import { safeSend } from '@lib/media_sender.js'
import NodeCache from 'node-cache'

// ─── Cache local primer nivel ─────────────────────────────────────────────────
const localCache = new NodeCache({ stdTTL: 5 })
const spamCache  = new NodeCache({ stdTTL: 30 })

// ─── Rate limit local sin Python ──────────────────────────────────────────────
function localRateLimit(sender: string, maxHits = 5, windowMs = 5000): boolean {
  const key  = `rl:${sender}`
  const now  = Date.now()
  const hits = (localCache.get<number[]>(key) ?? [])
    .filter(t => now - t < windowMs)

  if (hits.length >= maxHits) return false

  hits.push(now)
  localCache.set(key, hits)
  return true
}

// ─── Detectar spam de texto — pure JS sin latencia ───────────────────────────
function localSpamCheck(text: string): boolean {
  if (text.length > 1000) return true

  let count = 1
  for (let i = 1; i < text.length; i++) {
    if (text[i] === text[i - 1]) {
      count++
      if (count >= 10) return true
    } else {
      count = 1
    }
  }
  return false
}

// ─── SpamGuard C — check combinado rate + flood ───────────────────────────────
async function spamGuardCheck(
  sender: string,
  text:   string,
): Promise<{ allowed: boolean; reason: string; cooldown_ms: number }> {
  try {
    const res = await pythonPost<{
      allowed:     boolean
      reason:      string
      cooldown_ms: number
      code:        number
    }>('/api/v1/spam/check', {
      sender,
      text,
      max_hits:        8,
      window_ms:       5000,
      max_repeats:     3,
      flood_window_ms: 30000,
    })
    return res?.data ?? { allowed: true, reason: 'ok', cooldown_ms: 0 }
  } catch {
    // si Flask no responde — permitir para no bloquear al usuario
    return { allowed: true, reason: 'flask_unavailable', cooldown_ms: 0 }
  }
}

function formatCooldown(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

// ─── Middleware principal ──────────────────────────────────────────────────────
export async function rateLimitMiddleware(ctx: BotContext): Promise<boolean> {
  const { sender, text, sock, jid, isOwner } = ctx

  // owner siempre pasa
  if (isOwner) return true

  // 1. spam de texto — local sin latencia
  if (text && localSpamCheck(text)) return false

  // 2. rate limit local — sincrono sin red
  const localOk = localRateLimit(sender)
  if (!localOk) {
    const spamKey   = `spam:${sender}`
    const spamCount = (spamCache.get<number>(spamKey) ?? 0) + 1
    spamCache.set(spamKey, spamCount)

    if (spamCount % 3 === 1) {
      safeSend(() => sock.sendMessage(jid, {
        text: '§ Espera unos segundos antes de enviar otro mensaje.',
      })).catch(() => {})
    }
    return false
  }

  // 3. SpamGuard C — rate + flood combinado
  // solo para comandos (tiene prefix) — evitar overhead en mensajes normales
  if (text && ctx.prefix && ctx.command) {
    const guard = await spamGuardCheck(sender, text)

    if (!guard.allowed) {
      const spamKey   = `sg:${sender}`
      const sgCount   = (spamCache.get<number>(spamKey) ?? 0) + 1
      spamCache.set(spamKey, sgCount)

      // avisar según tipo
      if (sgCount % 3 === 1) {
        const msgs: Record<string, string> = {
          rate_limit: guard.cooldown_ms > 0
            ? `§ Demasiado rápido — espera *${formatCooldown(guard.cooldown_ms)}*`
            : '§ Demasiado rápido — espera unos segundos',
          blocked: guard.cooldown_ms > 0
            ? `§ Bloqueado por spam — espera *${formatCooldown(guard.cooldown_ms)}*`
            : '§ Bloqueado temporalmente por spam',
          flood: '§ Deja de repetir el mismo mensaje',
        }
        const msg = msgs[guard.reason] ?? '§ Espera antes de continuar'
        safeSend(() => sock.sendMessage(jid, { text: msg })).catch(() => {})
      }
      return false
    }
  }

  return true
}