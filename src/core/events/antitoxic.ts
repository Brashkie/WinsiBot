import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'
import { analyzeIntent } from '@lib/pythonBridge.js'

// ─────────────────────────────────────────────────────────────────────────────
//  antitoxic — Rust NLP (insult/nsfw) → warn → kick al 4to aviso
//  L1: Rust /nlp/fast (regex precompilada, sub-ms)
//  L2: regex local como fallback si Rust no responde
// ─────────────────────────────────────────────────────────────────────────────

// Warns por grupo: warnMap[groupJid][senderJid] = count
const warnMap = new Map<string, Map<string, number>>()
const WARN_RESET_MS = 30 * 60_000 // limpia warns pasados 30 min de inactividad
const resetTimers  = new Map<string, ReturnType<typeof setTimeout>>()

function getWarn(groupJid: string, sender: string): number {
  return warnMap.get(groupJid)?.get(sender) ?? 0
}

function addWarn(groupJid: string, sender: string): number {
  if (!warnMap.has(groupJid)) warnMap.set(groupJid, new Map())
  const g     = warnMap.get(groupJid)!
  const count = (g.get(sender) ?? 0) + 1
  g.set(sender, count)

  // reset automático por inactividad
  const key = `${groupJid}:${sender}`
  clearTimeout(resetTimers.get(key))
  resetTimers.set(key, setTimeout(() => {
    warnMap.get(groupJid)?.delete(sender)
    resetTimers.delete(key)
  }, WARN_RESET_MS))

  return count
}

function clearWarn(groupJid: string, sender: string): void {
  warnMap.get(groupJid)?.delete(sender)
  const key = `${groupJid}:${sender}`
  clearTimeout(resetTimers.get(key))
  resetTimers.delete(key)
}

// Regex local fallback (cubre lo que Rust no detecta por config de umbral)
const LOCAL_TOXIC = /\b(mierda|idiota|estupido|inutil|pendejo|hdp|ctm|puta|basura|malparido|gonorrea|imbecil|verga|chucha|maricon|perra|zorra|carajo|cabron|capullo|cagon|pedorro|pinga|chupame|chupala|hijodeputa|hijueputa|mamahuevo|concha|coño|joto|baboso|naco|faggot|bastard|bitch|motherfucker|asshole|cunt)\b/i

async function isToxic(text: string): Promise<boolean> {
  try {
    const r = await analyzeIntent(text)
    if (r) {
      return r.primary === 'insult' || r.primary === 'nsfw'
    }
  } catch {}
  return LOCAL_TOXIC.test(text)
}

export async function handleAntitoxic(
  sock:      WASocket,
  jid:       string,
  sender:    string,
  msgKey:    any,
  text:      string,
  isAdmin:   boolean,
  isBotAdmin: boolean,
): Promise<void> {
  const config = getGroupConfig(jid)
  if (!config.antitoxic) return
  if (isAdmin) return
  if (!isBotAdmin) return
  if (!(await isToxic(text))) return

  // Eliminar mensaje
  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})

  const num   = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  const warns = addWarn(jid, sender)

  if (warns < 4) {
    await sock.sendMessage(jid, {
      text:     `⚠️ *Anti-Tóxico* · Advertencia *${warns}/3* @${num}\nEvita palabras ofensivas — al 4to aviso serás expulsado.`,
      mentions: [sender],
    }).catch(() => {})
  } else {
    // 4to aviso — kick
    clearWarn(jid, sender)
    await sock.sendMessage(jid, {
      text:     `🚫 @${num} ha sido *expulsado* por lenguaje tóxico reiterado.`,
      mentions: [sender],
    }).catch(() => {})
    await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {})
  }
}
