// Efectos de audio (#nightcore, #bass, #reverb…): un audio, una nota de voz o
// un video citado, pasado por un filtro de ffmpeg y devuelto como nota de voz.
//
// Todo lo hace ffmpeg, que ya viene con el bot y es C nativo con sus filtros
// optimizados —el cambio de tono, la ecualización, el eco, la FFT del robot—:
// escribir un procesador propio sería reimplementar lo que ya está, más lento.
// Del lado de Node solo se arma la línea de comandos.
//
// Para que no cueste de más: el audio se corta a MAX_SEGUNDOS, sale mono a
// 48 kHz en Opus a 48 kbps —lo que WhatsApp usa para las notas de voz— y el
// proceso tiene un tiempo máximo. Un efecto estéreo (8D) sale en estéreo.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { ffmpegPath } from './ffmpeg.js'
import { carpetaTmp } from './utils.js'

const run = promisify(execFile)

/** Más que esto no se procesa: un audio de una hora no es un comando de chat. */
export const MAX_SEGUNDOS = 300

export interface Efecto {
  /** El comando, y sus alias. */
  nombre: string
  alias: string[]
  emoji: string
  /** El filtro de ffmpeg (`-af`). */
  filtro: string
  /** Cuánto cambia la duración (nightcore: dura 1/1,25 del original). */
  velocidad: number
  estereo?: boolean
}

// Cambiar el tono sin un filtro de tono: se reinterpreta la frecuencia de
// muestreo (asetrate) —sube o baja tono y velocidad juntos, como acelerar un
// vinilo— y se vuelve a 48 kHz. Para cambiar solo el tono se compensa la
// velocidad con atempo.
const tono = (f: number) => `aresample=48000,asetrate=${48000 * f},aresample=48000`

export const EFECTOS: Efecto[] = [
  { nombre: 'nightcore', alias: ['nc'], emoji: '🌙', filtro: tono(1.25), velocidad: 1.25 },
  { nombre: 'lento', alias: ['slowed', 'slow', 'slowmo'], emoji: '🐢', filtro: `${tono(0.8)},aecho=0.8:0.85:40:0.25`, velocidad: 0.8 },
  { nombre: 'rapido', alias: ['fast', 'rápido'], emoji: '⚡', filtro: 'atempo=1.5', velocidad: 1.5 },
  { nombre: 'bass', alias: ['bassboost', 'bajos', 'graves'], emoji: '🔊', filtro: 'bass=g=12:f=100:w=0.6,alimiter=limit=0.9', velocidad: 1 },
  { nombre: 'reverb', alias: ['reverbe', 'reverberacion', 'reverberación'], emoji: '🏛️', filtro: 'aecho=0.8:0.88:60|120|180:0.4|0.3|0.2', velocidad: 1 },
  { nombre: 'eco', alias: ['echo'], emoji: '🏔️', filtro: 'aecho=0.8:0.9:500|1000:0.4|0.2', velocidad: 1 },
  { nombre: 'ardilla', alias: ['chipmunk', 'squirrel', 'agudo'], emoji: '🐿️', filtro: `${tono(1.6)},atempo=0.625`, velocidad: 1 },
  { nombre: 'grave', alias: ['deep', 'vozgrave', 'demonio'], emoji: '👹', filtro: `${tono(0.7)},atempo=1.4286`, velocidad: 1 },
  { nombre: 'robot', alias: ['robotico', 'robótico'], emoji: '🤖', filtro: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75", velocidad: 1 },
  { nombre: 'reversa', alias: ['reverse', 'alreves', 'alrevés'], emoji: '🔁', filtro: 'areverse', velocidad: 1 },
  // `telefono` ya es de #historia (el teléfono descompuesto): este es `radio`.
  { nombre: 'radio', alias: ['phone', 'llamada', 'walkie'], emoji: '📞', filtro: 'highpass=f=300,lowpass=f=3400,volume=1.5', velocidad: 1 },
  { nombre: 'vibrato', alias: ['tremolo', 'temblor'], emoji: '〰️', filtro: 'vibrato=f=6:d=0.6', velocidad: 1 },
  { nombre: '8d', alias: ['audio8d', 'envolvente'], emoji: '🎧', filtro: 'apulsator=hz=0.125:amount=0.9', velocidad: 1, estereo: true },
]

export const efectoDe = (comando: string) => EFECTOS.find(e => e.nombre === comando || e.alias.includes(comando))

/** Los argumentos de ffmpeg para pasar `entrada` por `efecto` a `salida` (.ogg). */
export function argumentos(efecto: Efecto, entrada: string, salida: string): string[] {
  return [
    '-y', '-v', 'error',
    // -t antes de -i corta la LECTURA: no se decodifica lo que no se usa.
    '-t', String(MAX_SEGUNDOS), '-i', entrada,
    '-vn', '-af', efecto.filtro,
    '-ac', efecto.estereo ? '2' : '1', '-ar', '48000',
    '-c:a', 'libopus', '-b:a', efecto.estereo ? '64k' : '48k', '-application', 'audio',
    salida,
  ]
}

/** Aplica el efecto; devuelve el .ogg (Opus) listo para mandar como nota de voz. */
export async function aplicarEfecto(entrada: Buffer, efecto: Efecto): Promise<Buffer> {
  const dir = await carpetaTmp()
  const id = randomUUID()
  const inFile = join(dir, `${id}.in`)
  const outFile = join(dir, `${id}.ogg`)
  try {
    await writeFile(inFile, entrada)
    await run(ffmpegPath(), argumentos(efecto, inFile, outFile), { timeout: 60_000, windowsHide: true })
    return await readFile(outFile)
  } finally {
    await unlink(inFile).catch(() => {})
    await unlink(outFile).catch(() => {})
  }
}
