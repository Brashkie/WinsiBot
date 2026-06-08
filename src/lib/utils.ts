import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import axios from 'axios'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { WAMessage } from '@whiskeysockets/baileys'
import { unlink } from 'fs/promises'

export function getTempPath(ext: string): string {
  return join(tmpdir(), `winsi_${randomUUID()}.${ext}`)
}

export async function downloadFile(url: string, ext: string): Promise<string> {
  const dest = getTempPath(ext)
  const res = await axios.get(url, { responseType: 'stream' })
  await pipeline(res.data, createWriteStream(dest))
  return dest
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function getMsgType(msg: WAMessage): string {
  const m = msg.message
  if (!m) return 'unknown'
  if (m.imageMessage) return 'image'
  if (m.videoMessage) return 'video'
  if (m.audioMessage) return 'audio'
  if (m.stickerMessage) return 'sticker'
  if (m.documentMessage) return 'document'
  return 'text'
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  )
}

export async function cleanTemp(...paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map(p => unlink(p)))
}

// ─── Tiempo ───────────────────────────────────────────────────────────────────

export function msToTime(ms: number): string {
  if (!ms || isNaN(ms)) return '0 segundos'
  const s = Math.floor((ms / 1000) % 60)
  const m = Math.floor((ms / 60_000) % 60)
  const h = Math.floor((ms / 3_600_000) % 24)
  const d = Math.floor(ms / 86_400_000)
  const parts: string[] = []
  if (d > 0) parts.push(`${d} día${d > 1 ? 's' : ''}`)
  if (h > 0) parts.push(`${h} hora${h > 1 ? 's' : ''}`)
  if (m > 0) parts.push(`${m} minuto${m > 1 ? 's' : ''}`)
  if (s > 0) parts.push(`${s} segundo${s > 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : '0 segundos'
}

export function formatCooldown(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function checkCooldown(
  lastTime: number | undefined,
  cooldownMs: number,
): { expired: boolean; remaining: number; remainingFormatted: string } {
  const elapsed   = Date.now() - (lastTime ?? 0)
  const remaining = Math.max(0, cooldownMs - elapsed)
  return { expired: elapsed >= cooldownMs, remaining, remainingFormatted: formatCooldown(remaining) }
}

// ─── Texto ────────────────────────────────────────────────────────────────────

export function capitalize(text: string): string {
  return text.replace(/\b\w/g, l => l.toUpperCase())
}

export function truncate(text: string, max = 100): string {
  return text.length <= max ? text : text.slice(0, max - 3) + '...'
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\-]/g, '\\$&')
}

export function extractMentions(text: string): string[] {
  return (text.match(/@(\d{1,16})/g) ?? []).map(m => m.replace('@', '') + '@s.whatsapp.net')
}

export function randomString(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/[<>'"]/g, '').trim()
}

// ─── Validación ───────────────────────────────────────────────────────────────

export function isValidUrl(str: string): boolean {
  try { new URL(str); return true } catch { return false }
}

export function isValidJid(jid: string): boolean {
  return /^(\d{1,16}|[\w.-]+)@(s\.whatsapp\.net|g\.us|broadcast)$/.test(jid)
}

// ─── Números ──────────────────────────────────────────────────────────────────

export function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function roundTo(n: number, decimals = 2): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return isFinite(n) ? n : fallback
}

// ─── Arrays ───────────────────────────────────────────────────────────────────

export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T
    a[i] = a[j] as T
    a[j] = tmp
  }
  return a
}

export function uniqueArray<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'crypto'

export function md5(text: string): string {
  return createHash('md5').update(text).digest('hex')
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex')
}

// ─── Async helpers ────────────────────────────────────────────────────────────

export async function retryWithBackoff<T>(
  fn:          () => Promise<T>,
  maxRetries   = 3,
  baseDelayMs  = 1_000,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      if (i < maxRetries) await sleep(baseDelayMs * 2 ** i)
    }
  }
  throw lastErr
}

export function debounce<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args)
      inThrottle = true
      setTimeout(() => { inThrottle = false }, limit)
    }
  }
}

// ─── WhatsApp group helpers ───────────────────────────────────────────────────

interface Participant { id: string; admin?: 'admin' | 'superadmin' | null }

export function hasBotAdminPerms(participants: Participant[], botJid: string): boolean {
  const p = participants.find(x => x.id === botJid)
  return p?.admin === 'admin' || p?.admin === 'superadmin'
}

export function isGroupAdmin(participants: Participant[], userJid: string): boolean {
  const p = participants.find(x => x.id === userJid)
  return p?.admin === 'admin' || p?.admin === 'superadmin'
}

export function getGroupAdmins(participants: Participant[]): string[] {
  return participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id)
}