import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'

// ─────────────────────────────────────────────────────────────────────────────
//  antilink — detección de links por plataforma + links de grupos WA
//  No se usa Rust aquí: URL regex no es CPU-heavy, el bottleneck es I/O.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Regexes por plataforma ───────────────────────────────────────────────────

const RE: Record<string, RegExp> = {
  // Links de grupos de WhatsApp (antilink)
  wa:        /chat\.whatsapp\.com\/[0-9A-Za-z]{10,}|5chat-whatzapp\.vercel\.app/i,
  // Links de canales/newsletters de WhatsApp (antilink)
  waChannel: /whatsapp\.com\/channel\/[0-9A-Za-z]{10,}/i,
  // Plataformas
  tiktok:    /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)(\/\S*)?/i,
  youtube:   /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)(\/\S*)?/i,
  telegram:  /(?:https?:\/\/)?(?:www\.)?(?:telegram\.org|t\.me)(\/\S*)?/i,
  discord:   /(?:https?:\/\/)?(?:www\.)?(?:discord\.com|discord\.gg)(\/\S*)?/i,
  // Link genérico (antilink2 — cualquier URL)
  generic:   /(?:https?:\/\/[^\s]+)|(?:\bwww\.[^\s]+\.[a-z]{2,})/i,
}

export interface LinkCheckResult {
  matched:   boolean
  platform?: 'wa' | 'waChannel' | 'tiktok' | 'youtube' | 'telegram' | 'discord' | 'generic'
}

export function detectLink(text: string, cfg: ReturnType<typeof getGroupConfig>): LinkCheckResult {
  if (!text) return { matched: false }

  if ((cfg.antilink)  && (RE.wa.test(text) || RE.waChannel.test(text))) return { matched: true, platform: 'wa' }
  if (cfg.antitiktok   && RE.tiktok.test(text))   return { matched: true, platform: 'tiktok' }
  if (cfg.antiyoutube  && RE.youtube.test(text))   return { matched: true, platform: 'youtube' }
  if (cfg.antitelegram && RE.telegram.test(text))  return { matched: true, platform: 'telegram' }
  if (cfg.antidiscord  && RE.discord.test(text))   return { matched: true, platform: 'discord' }
  if (cfg.antilink2    && RE.generic.test(text))   return { matched: true, platform: 'generic' }

  return { matched: false }
}

const PLATFORM_NAMES: Record<string, string> = {
  wa:        'WhatsApp',
  waChannel: 'WhatsApp',
  tiktok:    'TikTok',
  youtube:   'YouTube',
  telegram:  'Telegram',
  discord:   'Discord',
  generic:   'enlace',
}

export async function handleAntilink(
  sock:       WASocket,
  jid:        string,
  sender:     string,
  msgKey:     any,
  text:       string,
  isAdmin:    boolean,
  isBotAdmin: boolean,
): Promise<void> {
  if (!isBotAdmin || isAdmin) return

  const config = getGroupConfig(jid)
  const result = detectLink(text, config)
  if (!result.matched) return

  const num      = sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
  const platform = PLATFORM_NAMES[result.platform ?? 'generic']

  await sock.sendMessage(jid, { delete: msgKey }).catch(() => {})
  await sock.sendMessage(jid, {
    text:     `🔗 @${num} los links de *${platform}* no están permitidos en este grupo.`,
    mentions: [sender],
  }).catch(() => {})
  await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {})
}

// Compatibilidad con usos anteriores
export function containsLink(text: string): boolean {
  return RE.wa.test(text) || RE.waChannel.test(text) || RE.generic.test(text)
}
