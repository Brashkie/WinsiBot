// Hecho por BrashkieBot

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import axios from 'axios'
import { ffmpegPath } from './ffmpeg.js'
import { Queue } from './queue.js'
import { createCache, registerCache } from './cacheManager.js'
import { binPath, exeName } from './platform.js'
import { USER_AGENT } from '@config'
import { carpetaTmp } from './utils.js'

// yt-dlp se lanza con execFile: los argumentos le llegan tal cual, sin pasar
// por un shell. Hasta la 9.2 se armaba un comando de shell con el texto del
// usuario entre comillas dobles, y en Linux y Termux las comillas dobles no
// impiden `$(...)`: `#play $(curl … | sh)` ejecutaba lo que fuera en la
// máquina, lo mandara quien lo mandara. En Windows bastaba cerrar la comilla.
const execFileAsync = promisify(execFile)

/**
 * Los argumentos de yt-dlp para un pedido. El objetivo va después de `--`:
 * así un texto que empiece con `-` no se lee como opción (yt-dlp tiene
 * `--exec`, que también ejecuta comandos). Una búsqueda va con `ytsearch1:`.
 */
export function argsYtdlp(ffmpeg: string, opciones: readonly string[], objetivo: string): string[] {
  return [...(ffmpeg ? ['--ffmpeg-location', ffmpeg] : []), ...opciones, '--', objetivo]
}

export function objetivoDe(query: string): string {
  return query.startsWith('http') ? query : `ytsearch1:${query}`
}

// Limita cuántas descargas (yt-dlp/ffmpeg, pesadas en CPU/ancho de banda) corren
// en simultáneo — sin esto, una ráfaga de comandos de descarga en varios grupos
// puede agotar recursos del sistema sin ningún límite.
const downloadQueue = new Queue(3)

// Cola APARTE para audio de YouTube (#ytmp3/#ytaudio/#playaudio) — extraer
// solo audio es mucho más liviano que descargar+codificar video (sin decode
// de frames de video), así que una descarga de video pesada compitiendo por
// los mismos 3 cupos de downloadQueue no debería hacer esperar a alguien que
// solo pidió una canción. Más cupos que downloadQueue a propósito, por lo
// mismo — el costo por tarea es menor.
const audioQueue = new Queue(4)

// Caché de resultados + dedupe de descargas en curso, específico para audio
// — en un grupo activo, varios usuarios pidiendo la MISMA canción casi al
// mismo tiempo (un tema en tendencia, alguien la vuelve a pedir) disparaban
// una descarga+transcodificación de yt-dlp completa por cada uno. Ahora:
// si ya está cacheada, se responde al instante; si ya se está descargando,
// todos los pedidos iguales esperan esa MISMA promesa en vez de arrancar la
// suya. maxSize chico a propósito — son buffers de varios MB cada uno, no
// texto, así que 40 entradas ya son ~100-150MB en memoria.
const audioResultCache = registerCache('ytAudioResult', createCache<DownloadResult>({ ttl: 15 * 60_000, maxSize: 40 }))
const audioInFlight = new Map<string, Promise<DownloadResult>>()
const normalizeAudioKey = (q: string) => q.trim().toLowerCase()

// Mismo problema, mismo remedio, ahora para video (#ytvideo/#tiktok/#ig) —
// el contenido en tendencia (un TikTok viral, un video que varios en el
// mismo grupo mandan a la vez) disparaba una descarga+merge de yt-dlp
// COMPLETA por cada pedido idéntico, la operación más pesada de las tres
// (video+audio, no solo audio). maxSize más chico que el de audio a
// propósito — un buffer de video pesa varias veces más que uno de audio.
const videoResultCache = registerCache('videoResult', createCache<DownloadResult>({ ttl: 10 * 60_000, maxSize: 15 }))
const videoInFlight = new Map<string, Promise<DownloadResult>>()

async function withVideoDedup(
  key:  string,
  run:  () => Promise<DownloadResult>,
): Promise<DownloadResult> {
  const cached = videoResultCache.get(key)
  if (cached) return cached

  const inFlight = videoInFlight.get(key)
  if (inFlight) return inFlight

  const promise = run().then(result => {
    videoResultCache.set(key, result)
    return result
  })
  videoInFlight.set(key, promise)
  try {
    return await promise
  } finally {
    videoInFlight.delete(key)
  }
}

// ─── Path a yt-dlp ────────────────────────────────────────────────────────────
// yt-dlp es un programa externo, como ffmpeg: se usa su ejecutable, no se
// importa. Antes se buscaba primero dentro de python/venv, que se fue con
// Python en la 8.15.0. Ahora: bin/ (donde ya está ffmpeg), la raíz, o el PATH.
// Sus releases traen un ejecutable autónomo por plataforma que no pide Python
// instalado; en Termux, `pkg install yt-dlp`.
function getYtdlp(): string {
  for (const p of [binPath('yt-dlp'), join(process.cwd(), exeName('yt-dlp'))]) {
    if (existsSync(p)) return p
  }
  return 'yt-dlp'
}

// ─── Path a FFmpeg ────────────────────────────────────────────────────────────
// El mismo orden que el resto del bot (ffmpeg.ts): bin/ → ffmpeg-static → PATH.
// `--ffmpeg-location` acepta el binario o su carpeta. Antes se pasaba la
// carpeta bin/ si existía, pero desde la 8.15.0 existe siempre —ahí se baja la
// Session API—, así que sin un ffmpeg propio en bin/ (instalación normal,
// Termux) yt-dlp buscaba solo ahí y nunca llegaba a ffmpeg-static ni al PATH.
// Vacío = PATH del sistema.
function getFfmpegDir(): string {
  const ruta = ffmpegPath()
  return ruta === 'ffmpeg' ? '' : ruta
}

// ─── Carpeta temporal ─────────────────────────────────────────────────────────
// ─── Resultado de descarga ────────────────────────────────────────────────────
export interface DownloadResult {
  buffer:   Buffer
  filename: string
  ext:      string
}

// ─── Descargar audio de YouTube ───────────────────────────────────────────────
// Cacheado + deduplicado por query normalizada (ver audioResultCache/
// audioInFlight arriba) y corre en audioQueue, separada de la cola de video.
export async function downloadYoutubeAudio(query: string): Promise<DownloadResult> {
  const key = normalizeAudioKey(query)

  const cached = audioResultCache.get(key)
  if (cached) return cached

  const inFlight = audioInFlight.get(key)
  if (inFlight) return inFlight

  const promise = (async (): Promise<DownloadResult> => {
    const ytdlp   = getYtdlp()
    const ffmpeg  = getFfmpegDir()
    const tmpDir  = await carpetaTmp()
    const outFile = join(tmpDir, `${randomUUID()}.mp3`)

    try {
      await audioQueue.enqueue(() => execFileAsync(
        ytdlp,
        // audio-quality 4 (~165-185kbps VBR) en vez de 0 (~245kbps, la
        // configuración MÁS LENTA de codificar) — para escuchar por
        // WhatsApp la diferencia es imperceptible, y el ffmpeg interno de
        // yt-dlp tarda notablemente menos en transcodificar a esta calidad.
        argsYtdlp(ffmpeg, ['-x', '--audio-format', 'mp3', '--audio-quality', '4', '-o', outFile, '--no-playlist', '--max-filesize', '50m'], objetivoDe(query)),
        { timeout: 60_000 }
      ), 60_000)
      const buffer = await readFile(outFile)
      const result: DownloadResult = { buffer, filename: outFile, ext: 'mp3' }
      audioResultCache.set(key, result)
      return result
    } finally {
      if (existsSync(outFile)) await unlink(outFile).catch(() => {})
    }
  })()

  audioInFlight.set(key, promise)
  try {
    return await promise
  } finally {
    audioInFlight.delete(key)
  }
}

// ─── Descargar video de YouTube ───────────────────────────────────────────────
export async function downloadYoutubeVideo(query: string, quality = '360'): Promise<DownloadResult> {
  const key = `yt:${quality}:${query.trim().toLowerCase()}`
  return withVideoDedup(key, async () => {
    const ytdlp   = getYtdlp()
    const ffmpeg  = getFfmpegDir()
    const tmpDir  = await carpetaTmp()
    const outFile = join(tmpDir, `${randomUUID()}.mp4`)

    // La calidad entra en un argumento de yt-dlp: solo dígitos.
    const alto = /^\d{2,4}$/.test(quality) ? quality : '360'

    try {
      await downloadQueue.enqueue(() => execFileAsync(
        ytdlp,
        argsYtdlp(ffmpeg, [
          '-f', `bestvideo[height<=${alto}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${alto}][ext=mp4]/best`,
          '-o', outFile, '--no-playlist', '--max-filesize', '50m', '--merge-output-format', 'mp4',
        ], objetivoDe(query)),
        { timeout: 120_000 }
      ), 120_000)
      const buffer = await readFile(outFile)
      return { buffer, filename: outFile, ext: 'mp4' }
    } finally {
      if (existsSync(outFile)) await unlink(outFile).catch(() => {})
    }
  })
}

// ─── Descargar TikTok ─────────────────────────────────────────────────────────
export async function downloadTikTok(url: string): Promise<DownloadResult> {
  const key = `tiktok:${url.trim().toLowerCase()}`
  return withVideoDedup(key, async () => {
    const ytdlp   = getYtdlp()
    const ffmpeg  = getFfmpegDir()
    const tmpDir  = await carpetaTmp()
    const outFile = join(tmpDir, `${randomUUID()}.mp4`)
    try {
      await downloadQueue.enqueue(() => execFileAsync(
        ytdlp,
        argsYtdlp(ffmpeg, ['-o', outFile, '--no-playlist', '--max-filesize', '50m'], url),
        { timeout: 60_000 }
      ), 60_000)
      const buffer = await readFile(outFile)
      return { buffer, filename: outFile, ext: 'mp4' }
    } finally {
      if (existsSync(outFile)) await unlink(outFile).catch(() => {})
    }
  })
}

// ─── Descargar buffer desde URL ───────────────────────────────────────────────
export async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout:      15_000,
    headers: { 'User-Agent': USER_AGENT },
  })
  return Buffer.from(res.data)
}

// ─── Obtener info de YouTube sin descargar ────────────────────────────────────
export interface YoutubeInfo {
  title:      string
  duration:   number
  uploader:   string
  thumbnail:  string
  url:        string
  views:      number
  uploadedAt: string  // texto relativo, p.ej. "hace 3 años"
}

function formatUploadDate(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length !== 8) return 'Desconocido'
  const year  = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6)) - 1
  const day   = Number(raw.slice(6, 8))
  const date  = new Date(year, month, day)
  const days  = Math.floor((Date.now() - date.getTime()) / 86_400_000)

  if (days < 1)  return 'hoy'
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`
  const years = Math.floor(days / 365)
  return `hace ${years} año${years === 1 ? '' : 's'}`
}

export async function getYoutubeInfo(query: string): Promise<YoutubeInfo> {
  const ytdlp  = getYtdlp()
  const ffmpeg = getFfmpegDir()
  const { stdout } = await execFileAsync(
    ytdlp,
    argsYtdlp(ffmpeg, ['--dump-json', '--no-playlist'], objetivoDe(query)),
    { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
  )

  const info = JSON.parse(stdout.trim().split('\n')[0] ?? '{}')
  return {
    title:      info.title       ?? 'Sin titulo',
    duration:   info.duration    ?? 0,
    uploader:   info.uploader    ?? 'Desconocido',
    thumbnail:  info.thumbnail   ?? '',
    url:        info.webpage_url ?? query,
    views:      info.view_count  ?? 0,
    uploadedAt: formatUploadDate(info.upload_date),
  }
}

// ─── Formatters compartidos por los comandos de YouTube (audio/video) ────────

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} minutos ${s} segundos`
}

export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)}MB`
}
