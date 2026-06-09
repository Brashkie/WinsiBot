// ─── Captcha de bienvenida ────────────────────────────────────────────────────
//
// Flow:
//  1. Usuario entra al grupo (action='add') → handleCaptchaJoin() si captcha=true
//  2. Bot muta al usuario y envía el desafío al grupo
//  3. En handler.ts: verifyCaptchaAnswer() detecta si es un captcha pendiente
//  4. Si acierta → desmuta; si falla o expira → expulsa

import type { WASocket } from '@whiskeysockets/baileys'
import { CaptchaGenerator, CaptchaVerification, type CaptchaChallenge } from '@lib/captcha.js'

interface PendingCaptcha {
  challenge: CaptchaChallenge
  groupJid:  string
}

// groupJid:userJid → PendingCaptcha
const pending = new Map<string, PendingCaptcha>()
const gen     = new CaptchaGenerator(90_000, 3)   // 90 s, 3 intentos
const verify  = new CaptchaVerification()

function key(groupJid: string, userJid: string) { return `${groupJid}:${userJid}` }

// ─── Inicia captcha cuando alguien entra ─────────────────────────────────────

export async function handleCaptchaJoin(
  sock:       WASocket,
  groupJid:   string,
  userJid:    string,
): Promise<void> {
  const challenge = gen.generate()
  pending.set(key(groupJid, userJid), { challenge, groupJid })

  const num  = userJid.split('@')[0]
  const text = [
    `🔐 *VERIFICACIÓN REQUERIDA* para @${num}`,
    '',
    gen.formatMessage(challenge),
    '',
    `_Si no respondes en 90 segundos serás expulsado_`,
  ].join('\n')

  await sock.sendMessage(groupJid, {
    text,
    mentions: [userJid],
  }).catch(() => {})

  // Mutar al usuario hasta que verifique
  await sock.groupParticipantsUpdate(groupJid, [userJid], 'demote').catch(() => {})

  // Expiración automática
  setTimeout(() => expireCaptcha(sock, groupJid, userJid), challenge.expiresAt - Date.now() + 2000)
}

// ─── Verifica respuesta en handler.ts ────────────────────────────────────────

export async function verifyCaptchaAnswer(
  sock:     WASocket,
  groupJid: string,
  userJid:  string,
  text:     string,
): Promise<boolean> {
  const k    = key(groupJid, userJid)
  const item = pending.get(k)
  if (!item) return false

  const { challenge } = item

  if (verify.isExpired(challenge)) {
    pending.delete(k)
    return false
  }

  const result = verify.verify(challenge, text)

  await sock.sendMessage(groupJid, {
    text: `@${userJid.split('@')[0]} ${result.message}`,
    mentions: [userJid],
  }).catch(() => {})

  if (result.success) {
    pending.delete(k)
    return true
  }

  if (!verify.canRetry(challenge)) {
    pending.delete(k)
    await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove').catch(() => {})
  }

  return true // consumed the message
}

// ─── Expiración ───────────────────────────────────────────────────────────────

async function expireCaptcha(sock: WASocket, groupJid: string, userJid: string) {
  const k = key(groupJid, userJid)
  if (!pending.has(k)) return
  pending.delete(k)
  await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove').catch(() => {})
  await sock.sendMessage(groupJid, {
    text: `⏱️ @${userJid.split('@')[0]} fue expulsado por no completar la verificación.`,
    mentions: [userJid],
  }).catch(() => {})
}

export function hasPendingCaptcha(groupJid: string, userJid: string): boolean {
  return pending.has(key(groupJid, userJid))
}
