import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import axios from 'axios'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { mkdir, unlink } from 'fs/promises'

/** data/tmp, creada si hace falta: los archivos de paso de ffmpeg y del TTS. */
export async function carpetaTmp(): Promise<string> {
  const dir = join(process.cwd(), 'data', 'tmp')
  await mkdir(dir, { recursive: true })
  return dir
}

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

export function formatCooldown(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// ─── Texto ────────────────────────────────────────────────────────────────────

export function extractMentions(text: string): string[] {
  return (text.match(/@(\d{1,16})/g) ?? []).map(m => m.replace('@', '') + '@s.whatsapp.net')
}

// ─── Números ──────────────────────────────────────────────────────────────────

export function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ─── Arrays ───────────────────────────────────────────────────────────────────

export function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

/** Mezcla `arr` en el lugar (Fisher–Yates) y lo devuelve. */
export function mezclar<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/** Un id corto para cosas en memoria (retos, capchas, batallas): no es único
 *  en el mundo, solo entre los pocos que hay vivos a la vez. */
export function idCorto(largo = 8): string {
  return Math.random().toString(36).slice(2, 2 + largo)
}

// ─── Fechas ───────────────────────────────────────────────────────────────────

const dos = (n: number) => String(n).padStart(2, '0')

/** "18:05", hora local. */
export const horaLocal = (ms: number) => { const d = new Date(ms); return `${dos(d.getHours())}:${dos(d.getMinutes())}` }

/** "24/10 18:05", hora local. */
export const fechaHoraLocal = (ms: number) => { const d = new Date(ms); return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${horaLocal(ms)}` }
