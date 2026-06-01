// Hecho por BrashkieBot

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import axios from 'axios'

const execAsync = promisify(exec)

// ─── Path a yt-dlp ────────────────────────────────────────────────────────────
function getYtdlp(): string {
  const venvExe = join(process.cwd(), 'python', 'venv', 'Scripts', 'yt-dlp.exe')
  const localExe = join(process.cwd(), 'yt-dlp.exe')
  if (existsSync(venvExe))  return venvExe
  if (existsSync(localExe)) return localExe
  return 'yt-dlp'
}

// ─── Path a FFmpeg (Detecta tu carpeta bin) ──────────────────────────────────
function getFfmpegDir(): string {
  // Según tu imagen, los .exe están en la carpeta 'bin' de la raíz del proyecto
  const binDir = join(process.cwd(), 'bin')
  return existsSync(binDir) ? binDir : ''
}

// ─── Carpeta temporal ─────────────────────────────────────────────────────────
async function getTmpDir(): Promise<string> {
  const dir = join(process.cwd(), 'data', 'tmp')
  await mkdir(dir, { recursive: true })
  return dir
}

// ─── Resultado de descarga ────────────────────────────────────────────────────
export interface DownloadResult {
  buffer:   Buffer
  filename: string
  ext:      string
}

// ─── Descargar audio de YouTube ───────────────────────────────────────────────
export async function downloadYoutubeAudio(query: string): Promise<DownloadResult> {
  const ytdlp   = getYtdlp()
  const ffmpeg  = getFfmpegDir()
  const tmpDir  = await getTmpDir()
  const outFile = join(tmpDir, `${randomUUID()}.mp3`)

  const isUrl  = query.startsWith('http')
  const target = isUrl ? query : `ytsearch1:${query}`
  
  // Flag para usar el FFmpeg local
  const ffmpegFlag = ffmpeg ? `--ffmpeg-location "${ffmpeg}"` : ''

  try {
    await execAsync(
      `"${ytdlp}" ${ffmpegFlag} -x --audio-format mp3 --audio-quality 0 -o "${outFile}" "${target}" --no-playlist --max-filesize 50m`,
      { timeout: 60_000 }
    )
    const buffer = await readFile(outFile)
    return { buffer, filename: outFile, ext: 'mp3' }
  } finally {
    if (existsSync(outFile)) await unlink(outFile).catch(() => {})
  }
}

// ─── Descargar video de YouTube ───────────────────────────────────────────────
export async function downloadYoutubeVideo(query: string, quality = '360'): Promise<DownloadResult> {
  const ytdlp   = getYtdlp()
  const ffmpeg  = getFfmpegDir()
  const tmpDir  = await getTmpDir()
  const outFile = join(tmpDir, `${randomUUID()}.mp4`)

  const isUrl  = query.startsWith('http')
  const target = isUrl ? query : `ytsearch1:${query}`
  const ffmpegFlag = ffmpeg ? `--ffmpeg-location "${ffmpeg}"` : ''

  try {
    await execAsync(
      `"${ytdlp}" ${ffmpegFlag} -f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best" -o "${outFile}" "${target}" --no-playlist --max-filesize 50m --merge-output-format mp4`,
      { timeout: 120_000 }
    )
    const buffer = await readFile(outFile)
    return { buffer, filename: outFile, ext: 'mp4' }
  } finally {
    if (existsSync(outFile)) await unlink(outFile).catch(() => {})
  }
}

// ─── Descargar TikTok ─────────────────────────────────────────────────────────
export async function downloadTikTok(url: string): Promise<DownloadResult> {
  const ytdlp   = getYtdlp()
  const ffmpeg  = getFfmpegDir()
  const tmpDir  = await getTmpDir()
  const outFile = join(tmpDir, `${randomUUID()}.mp4`)
  const ffmpegFlag = ffmpeg ? `--ffmpeg-location "${ffmpeg}"` : ''

  try {
    await execAsync(
      `"${ytdlp}" ${ffmpegFlag} -o "${outFile}" "${url}" --no-playlist --max-filesize 50m`,
      { timeout: 60_000 }
    )
    const buffer = await readFile(outFile)
    return { buffer, filename: outFile, ext: 'mp4' }
  } finally {
    if (existsSync(outFile)) await unlink(outFile).catch(() => {})
  }
}

// ─── Descargar Instagram ──────────────────────────────────────────────────────
export async function downloadInstagram(url: string): Promise<DownloadResult> {
  const ytdlp   = getYtdlp()
  const ffmpeg  = getFfmpegDir()
  const tmpDir  = await getTmpDir()
  const outFile = join(tmpDir, `${randomUUID()}.mp4`)
  const ffmpegFlag = ffmpeg ? `--ffmpeg-location "${ffmpeg}"` : ''

  try {
    await execAsync(
      `"${ytdlp}" ${ffmpegFlag} -o "${outFile}" "${url}" --no-playlist --max-filesize 50m`,
      { timeout: 60_000 }
    )
    const buffer = await readFile(outFile)
    return { buffer, filename: outFile, ext: 'mp4' }
  } finally {
    if (existsSync(outFile)) await unlink(outFile).catch(() => {})
  }
}

// ─── Descargar buffer desde URL ───────────────────────────────────────────────
export async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout:      15_000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
  })
  return Buffer.from(res.data)
}

// ─── Obtener info de YouTube sin descargar ────────────────────────────────────
export interface YoutubeInfo {
  title:     string
  duration:  number
  uploader:  string
  thumbnail: string
  url:       string
}

export async function getYoutubeInfo(query: string): Promise<YoutubeInfo> {
  const ytdlp  = getYtdlp()
  const ffmpeg = getFfmpegDir()
  const isUrl  = query.startsWith('http')
  const target = isUrl ? query : `ytsearch1:${query}`
  const ffmpegFlag = ffmpeg ? `--ffmpeg-location "${ffmpeg}"` : ''

  const { stdout } = await execAsync(
    `"${ytdlp}" ${ffmpegFlag} --dump-json --no-playlist "${target}"`,
    { timeout: 30_000 }
  )

  const info = JSON.parse(stdout.trim().split('\n')[0] ?? '{}')
  return {
    title:     info.title     ?? 'Sin titulo',
    duration:  info.duration  ?? 0,
    uploader:  info.uploader  ?? 'Desconocido',
    thumbnail: info.thumbnail ?? '',
    url:       info.webpage_url ?? query,
  }
}
