// dragoncity.ts — Catálogo Dragon City (#pet) + economía de Oro.
//
// Datos (579 dragones) desde Brashkie/module-data en MessagePack, mismo patrón
// que rollwaifu.ts. Imágenes/videos reales desde Brashkie/module-media:
//   image: stage 0 (huevo, SOLO se usa para la animación previa a nacer,
//          nunca es el estado de un dragón ya obtenido), 1 (recién nacido),
//          3 (evolución final) — fotos
//   vid:   stage 1 (se muestra una vez, en el momento exacto de nacer), 3
//          (se muestra una vez, en el momento exacto de la evolución final)

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import axios from 'axios'
import ffmpegStatic from 'ffmpeg-static'
import { decode } from '@msgpack/msgpack'
import { translate } from '@vitalets/google-translate-api'
import { createCache, registerCache } from './cacheManager.js'
import type { DragonCatalog, DragonDef } from '../types/index.js'

const execAsync = promisify(exec)

export const SOURCE_URL =
  'https://raw.githubusercontent.com/Brashkie/module-data/main/rollmedia/dragoncity.msgpack'

const CATALOG_KEY = 'all'
const catalogCache = registerCache('dragonCatalog', createCache<DragonDef[]>({ ttl: 60 * 60_000 }))

export async function getDragons(): Promise<DragonDef[]> {
  const cached = catalogCache.get(CATALOG_KEY)
  if (cached) return cached
  const res  = await axios.get<ArrayBuffer>(SOURCE_URL, {
    timeout:      15_000,
    responseType: 'arraybuffer',
    headers:      { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
  })
  const data     = decode(new Uint8Array(res.data)) as DragonCatalog
  const dragones = data.personajes ?? []
  catalogCache.set(CATALOG_KEY, dragones)
  return dragones
}

export async function findDragon(idOrSlug: string | number): Promise<DragonDef | undefined> {
  const dragons = await getDragons()
  const needle  = String(idOrSlug).toLowerCase().trim()
  return dragons.find(d =>
    String(d.id) === needle || d.slug.toLowerCase() === needle || d.name.toLowerCase() === needle,
  )
}

export function pickRandomDragon(dragons: DragonDef[]): DragonDef {
  return dragons[Math.floor(Math.random() * dragons.length)]!
}

// ─── Nivel / experiencia ───────────────────────────────────────────────────────
// Curva lineal, no exponencial (a diferencia del sistema de mascotas viejo):
// con evolución final en nivel 25, una curva 1.4^nivel pediría decenas de
// miles de alimentadas para llegar — esta pide ~440, alcanzable en unos
// días de juego normal dado el ritmo de acumulación de Oro.
export function expForLevel(level: number): number {
  return 50 + level * 40
}

// ─── Etapas de evolución ──────────────────────────────────────────────────────
// La etapa 0 (huevo) NUNCA es el estado de un dragón ya obtenido — es solo el
// visual previo a nacer (ver generateEggShakeVideo). Un dragón recién nacido
// ya arranca en etapa 1; evoluciona a la etapa 3 (final) en STAGE3_LEVEL.
export const STAGE3_LEVEL = 25

export function stageForLevel(level: number): 1 | 3 {
  return level >= STAGE3_LEVEL ? 3 : 1
}

export function imageForStage(dragon: DragonDef, stage: 0 | 1 | 3): string | undefined {
  return dragon.image.find(i => i.stage === stage)?.url
    ?? dragon.image[0]?.url
}

export function videoForStage(dragon: DragonDef, stage: 1 | 3): string | undefined {
  return dragon.vid.find(v => v.stage === stage)?.url
}

// ─── Oro — ingreso pasivo por minuto, según nivel ─────────────────────────────
// Fórmula derivada de la tabla de ganancias de Dragon City: 30 de base, +20
// oro/nivel hasta nivel 10, después el aumento se reduce a la mitad (+10/nivel).
export function goldPerMinute(level: number): number {
  if (level <= 10) return 30 + 20 * (level - 1)
  return 210 + 10 * (level - 10)
}

// Mismo criterio que los negocios (@lib/business.ts): tope de acumulación para
// incentivar volver seguido en vez de dejarlo juntando indefinidamente.
export const MAX_ACCUMULATION_HOURS = 24

export function pendingGold(level: number, lastCollect: number): number {
  const minutesElapsed = Math.min(
    MAX_ACCUMULATION_HOURS * 60,
    (Date.now() - lastCollect) / 60_000,
  )
  return Math.floor(minutesElapsed * goldPerMinute(level))
}

// ─── Costos ───────────────────────────────────────────────────────────────────
// El huevo se paga con ¥ (BrasCoins, la moneda que todos tienen desde el
// inicio) — si costara Oro habría un bloqueo de arranque: sin dragones no se
// gana Oro, y sin Oro no se podría conseguir el primer dragón. El Oro que dan
// los dragones ya obtenidos se gasta alimentándolos para subirlos de nivel.
export const HATCH_COST_MONEY = 800
export const FEED_EXP         = 30

export function feedCostOro(level: number): number {
  return 20 + level * 8
}

// ─── Traducción de la descripción (inglés → español) ─────────────────────────
// Mismo paquete/patrón que winfo.ts. Se cachea por dragón — la descripción
// nunca cambia, así que no tiene sentido volver a pedirle la traducción a
// Google cada vez que alguien mira el mismo dragón.
const descCache = registerCache('dragonDesc', createCache<string>({ ttl: 24 * 60 * 60_000 }))

export async function translatedDesc(dragon: DragonDef): Promise<string> {
  const key = String(dragon.id)
  const cached = descCache.get(key)
  if (cached) return cached
  try {
    const { text } = await translate(dragon.desp, { to: 'es' })
    descCache.set(key, text)
    return text
  } catch {
    return dragon.desp
  }
}

// ─── Animación de "huevo temblando" ────────────────────────────────────────────
// El huevo es una imagen estática (stage 0) — no hay ningún asset animado para
// ese momento en la fuente de datos (los .webm solo existen para las etapas 1
// y 3). Para simular que "está vivo"/a punto de romperse, se genera un video
// corto en el momento (ffmpeg, mismo binario que ya usa #sticker) con un
// bamboleo de rotación oscilante sobre la imagen estática, aplanando antes la
// transparencia del WebP sobre fondo blanco — sin ese paso, las esquinas que
// deja libres la rotación salen negras en vez de blancas al perder el canal
// alfa en la codificación final (h264 no soporta alfa).
async function getTmpDir(): Promise<string> {
  const dir = join(process.cwd(), 'data', 'tmp')
  await mkdir(dir, { recursive: true })
  return dir
}

function getFfmpegPath(): string {
  const binDir = join(process.cwd(), 'bin', 'ffmpeg.exe')
  if (existsSync(binDir)) return binDir
  return ffmpegStatic ?? 'ffmpeg'
}

export async function generateEggShakeVideo(imageBuffer: Buffer): Promise<Buffer> {
  const ffmpeg  = getFfmpegPath()
  const tmpDir  = await getTmpDir()
  const inFile  = join(tmpDir, `${randomUUID()}.webp`)
  const outFile = join(tmpDir, `${randomUUID()}.mp4`)

  const filter = [
    'color=white:size=480x480:duration=2.4[bg]',
    '[0:v]scale=480:480:force_original_aspect_ratio=decrease[egg]',
    '[bg][egg]overlay=(W-w)/2:(H-h)/2:shortest=1[flat]',
    '[flat]pad=560:560:(ow-iw)/2:(oh-ih)/2:color=white[padded]',
    `[padded]rotate='8*PI/180*sin(2*PI*t*2.5)':fillcolor=white:ow=560:oh=560[rot]`,
  ].join(';')

  try {
    await writeFile(inFile, imageBuffer)
    await execAsync(
      `"${ffmpeg}" -y -loop 1 -i "${inFile}" -t 2.4 -filter_complex "${filter}" ` +
      `-map "[rot]" -r 20 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "${outFile}"`,
      { timeout: 20_000 },
    )
    return await readFile(outFile)
  } finally {
    if (existsSync(inFile))  await unlink(inFile).catch(() => {})
    if (existsSync(outFile)) await unlink(outFile).catch(() => {})
  }
}

// ─── Videos de evolución (1.webm / 3.webm) — reencodeados a MP4 ───────────────
// Los .webm de la fuente vienen en VP9 — WhatsApp no los reproduce de forma
// confiable como mensaje de video nativo (aparecen como archivo descargable
// en vez de reproducirse/loopear como gifPlayback pide). Reencodear a
// H.264/MP4 antes de mandarlos, mismo binario de ffmpeg que ya usa el resto
// del bot (#sticker, generateEggShakeVideo).
export async function transcodeToMp4(webmBuffer: Buffer): Promise<Buffer> {
  const ffmpeg  = getFfmpegPath()
  const tmpDir  = await getTmpDir()
  const inFile  = join(tmpDir, `${randomUUID()}.webm`)
  const outFile = join(tmpDir, `${randomUUID()}.mp4`)

  try {
    await writeFile(inFile, webmBuffer)
    await execAsync(
      `"${ffmpeg}" -y -i "${inFile}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "${outFile}"`,
      { timeout: 20_000 },
    )
    return await readFile(outFile)
  } finally {
    if (existsSync(inFile))  await unlink(inFile).catch(() => {})
    if (existsSync(outFile)) await unlink(outFile).catch(() => {})
  }
}
