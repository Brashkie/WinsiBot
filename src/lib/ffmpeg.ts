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
import ffmpegStatic from 'ffmpeg-static'
import { binPath } from './platform.js'

export function ffmpegPath(): string {
  const propio = binPath('ffmpeg')
  if (existsSync(propio)) return propio
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic
  return 'ffmpeg'
}
