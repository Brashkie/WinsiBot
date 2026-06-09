import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'
import { analyzeIntent } from '@lib/pythonBridge.js'

// ─────────────────────────────────────────────────────────────────────────────
//  nsfw — Rust NLP (nsfw intent) → delete + aviso
//  Si nsfw=ON en el grupo → contenido explícito PERMITIDO
//  Si nsfw=OFF (default) → bloquear
// ─────────────────────────────────────────────────────────────────────────────

const LOCAL_NSFW = /\b(xxx|porn|porno|nsfw|nude|nudes|onlyfans|sexo|sex|desnudo|hentai|adulto|erotico|caliente|putita|putito)\b/i

async function isNSFW(text: string): Promise<boolean> {
  try {
    const r = await analyzeIntent(text)
    if (r) return r.primary === 'nsfw'
  } catch {}
  return LOCAL_NSFW.test(text)
}

export { isNSFW }
export function containsNSFW(text: string): boolean {
  return LOCAL_NSFW.test(text)
}

export async function handleNSFW(
  sock:       WASocket,
  jid:        string,
  sender:     string,
  msgKey:     any,
  text:       string,
  isAdmin:    boolean,
  isBotAdmin: boolean,
): Promise<void> {
  const config = getGroupConfig(jid)
  if (config.nsfw) return   // nsfw ON = contenido permitido
  if (isAdmin) return
  if (!isBotAdmin) return
  if (!(await isNSFW(text))) return

  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})

  const num = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  await sock.sendMessage(jid, {
    text:     `🔞 @${num} el contenido NSFW no está permitido en este grupo.`,
    mentions: [sender],
  }).catch(() => {})
}
