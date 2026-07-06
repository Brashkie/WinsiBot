import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'
import { analyzeIntent } from '@lib/pythonBridge.js'

// ─────────────────────────────────────────────────────────────────────────────
//  antispam — ventana deslizante + Rust NLP (spam/nonsense)
//  L1: Rust /nlp/fast detecta chars repetidos y patrones de junk (sub-ms)
//  L2: ventana deslizante en memoria (tasa de mensajes por JID)
//  Consecuencias escaladas: aviso → ban temporal → kick
// ─────────────────────────────────────────────────────────────────────────────

const SPAM_LIMIT    = 8      // mensajes en la ventana antes de actuar
const SPAM_WINDOW   = 5_000  // ms de ventana deslizante

interface SpamState {
  count:   number
  first:   number  // timestamp del primer mensaje en la ventana
  strikes: number  // número de veces que superó el límite
}

const spamMap = new Map<string, SpamState>()

// Limpia entradas antiguas cada 2 min
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of spamMap) {
    if (now - v.first > SPAM_WINDOW * 10) spamMap.delete(k)
  }
}, 2 * 60_000).unref()

function tick(key: string): { isSpam: boolean; strikes: number } {
  const now  = Date.now()
  const data = spamMap.get(key)

  if (!data || now - data.first > SPAM_WINDOW) {
    spamMap.set(key, { count: 1, first: now, strikes: data?.strikes ?? 0 })
    return { isSpam: false, strikes: data?.strikes ?? 0 }
  }

  data.count++
  if (data.count >= SPAM_LIMIT) {
    data.strikes++
    data.count  = 0
    data.first  = now
    return { isSpam: true, strikes: data.strikes }
  }
  return { isSpam: false, strikes: data.strikes }
}

function resetStrikes(key: string): void {
  spamMap.delete(key)
}

// Detecta spam de contenido (chars repetidos, junk) via Rust NLP
async function isContentSpam(text: string): Promise<boolean> {
  try {
    const r = await analyzeIntent(text)
    if (r) return r.primary === 'spam' || r.primary === 'nonsense'
  } catch {}
  // fallback local: más de 7 chars repetidos seguidos
  return /(.)\1{7,}/.test(text)
}

export async function handleSpam(
  sock:       WASocket,
  jid:        string,
  sender:     string,
  msgKey:     any,
  text:       string,
  isAdmin:    boolean,
  isBotAdmin: boolean,
): Promise<void> {
  const config = getGroupConfig(jid)
  if (!config.antispam) return
  if (isAdmin) return
  if (!isBotAdmin) return

  // Verificar spam de contenido vía Rust (contenido junk, chars repetidos)
  const contentSpam = await isContentSpam(text)

  // Verificar spam por tasa de mensajes (ventana deslizante) — key por grupo+sender
  // para que el contador no se comparta entre todos los grupos donde está el usuario.
  const key = `${jid}:${sender}`
  const { isSpam, strikes } = tick(key)

  if (!contentSpam && !isSpam) return

  const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

  // Eliminar el mensaje de spam
  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})

  if (strikes <= 1) {
    // 1er strike: advertencia
    await sock.sendMessage(jid, {
      text:     `⚠️ *Anti-Spam* @${num} — Envías mensajes muy rápido. Cálmate.`,
      mentions: [sender],
    }).catch(() => {})
  } else if (strikes === 2) {
    // 2do strike: aviso más firme
    await sock.sendMessage(jid, {
      text:     `🔴 *Anti-Spam* @${num} — Segundo aviso. Si continúas serás expulsado.`,
      mentions: [sender],
    }).catch(() => {})
  } else {
    // 3er strike+: kick
    resetStrikes(key)
    await sock.sendMessage(jid, {
      text:     `🚫 @${num} ha sido *expulsado* por spam reiterado.`,
      mentions: [sender],
    }).catch(() => {})
    await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {})
  }
}

// Mantiene compatibilidad con llamadas antiguas
export function checkSpam(sender: string, groupJid: string): boolean {
  const config = getGroupConfig(groupJid)
  if (!config.antispam) return false
  const { isSpam } = tick(`${groupJid}:${sender}`)
  return isSpam
}
