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