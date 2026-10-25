// El binario de ffmpeg que usan las conversiones del bot (video de dragones,
// notas de voz del TTS). Vivía como función privada en dragoncity.ts; el TTS
// necesitaba la misma, y una segunda copia es la que se desincroniza.
//
// Prioridad: bin/ del proyecto (si el owner puso su propio build) →
// ffmpeg-static (viene con npm, sin instalar nada) → "ffmpeg" del PATH, que es
// el caso de Termux: ffmpeg-static no publica binario para Android y ahí se
// instala con `pkg install ffmpeg`.
//
// downloader.ts tiene su propia versión a propósito: yt-dlp pide la CARPETA,
// no el binario.

import { existsSync } from 'fs'
import { readFile, unlink, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'
import ffmpegStatic from 'ffmpeg-static'
import { binPath } from './platform.js'
import { carpetaTmp } from './utils.js'

const run = promisify(execFile)

export function ffmpegPath(): string {
  const propio = binPath('ffmpeg')
  if (existsSync(propio)) return propio
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic
  return 'ffmpeg'
}

/**
 * Un video o GIF animado a MP4 H.264, que es lo que WhatsApp reproduce en
 * bucle con `gifPlayback`: un .gif o un .webm VP9 llegan como archivo para
 * descargar. Las dimensiones se redondean a pares, que H.264 en yuv420p exige
 * (un GIF de 499 px de ancho hace fallar a ffmpeg).
 *
 * La usaban los dragones (#pet, .webm) con su propia copia; ahora también
 * #slap (.gif de nekos.best).
 */
export async function aMp4(entrada: Buffer, ext: string): Promise<Buffer> {
  const dir = await carpetaTmp()
  const id = randomUUID()
  const inFile = join(dir, `${id}.${ext}`)
  const outFile = join(dir, `${id}.mp4`)
  try {
    await writeFile(inFile, entrada)
    await run(ffmpegPath(), [
      '-y', '-i', inFile,
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', outFile,
    ], { timeout: 20_000, windowsHide: true })
    return await readFile(outFile)
  } finally {
    await unlink(inFile).catch(() => {})
    await unlink(outFile).catch(() => {})
  }
}
