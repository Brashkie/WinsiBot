// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — EZGIF CONVERTER
//  Conversiones de media vía ezgif.com: webp↔mp4, gif↔mp4, video→gif, etc.
//  Puerto TypeScript basado en la lib original de Avenix-Multi / Hepein.
// ─────────────────────────────────────────────────────────────────────────────

import FormData from 'form-data'
import axios    from 'axios'
import crypto   from 'crypto'

// ─── Configuración ────────────────────────────────────────────────────────────

const CACHE_TTL    = 3_600_000  // 1 h
const CACHE_MAX    = 100
const MAX_RETRIES  = 3
const RETRY_DELAY  = 1_000
const TIMEOUT_UP   = 30_000
const TIMEOUT_CONV = 60_000

// ─── LRU cache ────────────────────────────────────────────────────────────────

interface CacheEntry { value: string; ts: number }
const _cache = new Map<string, CacheEntry>()

function _cacheKey(data: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
}

function _cacheGet(key: string): string | null {
  const item = _cache.get(key)
  if (!item) return null
  if (Date.now() - item.ts > CACHE_TTL) { _cache.delete(key); return null }
  _cache.delete(key); _cache.set(key, item)  // move to end (LRU)
  return item.value
}

function _cacheSet(key: string, value: string): void {
  if (_cache.has(key)) _cache.delete(key)
  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value!)
  _cache.set(key, { value, ts: Date.now() })
}

// ─── Tipos de conversión ──────────────────────────────────────────────────────

interface ConvertDef {
  url:    string
  params: Record<string, unknown>
  split:  { start: string; end: string }
}

const CONVERSIONS: Record<string, ConvertDef> = {
  'video-gif': {
    url:    'https://ezgif.com/video-to-gif',
    params: { start: 0, end: 10, size: 'original', fps: 10, method: 'ffmpeg' },
    split:  { start: '<img src="', end: '" style="width:' },
  },
  'gif-mp4': {
    url:    'https://ezgif.com/gif-to-mp4',
    params: { convert: 'Convert GIF to MP4!' },
    split:  { start: '" controls><source src="', end: '" type="video/mp4">Your browser' },
  },
  'webp-mp4': {
    url:    'https://ezgif.com/webp-to-mp4',
    params: {},
    split:  { start: '" controls><source src="', end: '" type="video/mp4">Your browser' },
  },
  'webp-png': {
    url:    'https://ezgif.com/webp-to-png',
    params: {},
    split:  { start: '<img src="', end: '" style="width:' },
  },
  'webp-gif': {
    url:    'https://ezgif.com/webp-to-gif',
    params: {},
    split:  { start: '<img src="', end: '" style="width:' },
  },
  'png-webp': {
    url:    'https://ezgif.com/png-to-webp',
    params: {},
    split:  { start: '<img src="', end: '" style="width:' },
  },
  'video-webp': {
    url:    'https://ezgif.com/video-to-webp',
    params: { start: 0, end: 10, size: 'original', fps: 10, loop: 'on' },
    split:  { start: '<img src="', end: '" style="width:' },
  },
  'gif-webp': {
    url:    'https://ezgif.com/gif-to-webp',
    params: {},
    split:  { start: '<img src="', end: '" style="width:' },
  },
  'gif-png': {
    url:    'https://ezgif.com/split',
    params: { method: 'im' },
    split:  { start: '"small button danger" href="', end: '">Download frames as ZIP' },
  },
  'video-jpg': {
    url:    'https://ezgif.com/video-to-jpg',
    params: { start: 0, end: 10, size: 'original', fps: 10 },
    split:  { start: '"small button danger" href="', end: '">Download frames as ZIP' },
  },
}

export type ConversionType = keyof typeof CONVERSIONS

// ─── Opciones de entrada ──────────────────────────────────────────────────────

export interface ConvertOptions {
  type:       ConversionType
  url?:       string
  file?:      Buffer
  filename?:  string
  [extra: string]: unknown
}

// ─── Lógica interna ───────────────────────────────────────────────────────────

async function _perform(opts: ConvertOptions): Promise<string> {
  const def = CONVERSIONS[opts.type]!

  // Paso 1: subir
  const form = new FormData()
  if (opts.file && opts.filename) {
    form.append('new-image', opts.file, { filename: opts.filename })
  } else if (opts.url) {
    form.append('new-image-url', opts.url)
  } else {
    throw new Error('Necesitas url o file+filename')
  }

  const upRes = await axios.post(def.url, form, {
    headers:        form.getHeaders(),
    timeout:        TIMEOUT_UP,
    maxRedirects:   5,
    validateStatus: () => true,
  })

  const redirectUrl: string = (upRes.request as any)?.res?.responseUrl ?? ''
  if (!redirectUrl) throw new Error('No se obtuvo URL de redirección al subir')

  const fileId = redirectUrl.split('/').pop() ?? ''

  // Paso 2: convertir
  const { type, file, filename, url, ...extra } = opts
  const convertParams = { ...def.params, ...extra, file: fileId }

  const convRes = await axios.post(
    `${redirectUrl}?ajax=true`,
    new URLSearchParams(
      Object.fromEntries(Object.entries(convertParams).map(([k, v]) => [k, String(v)]))
    ).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: TIMEOUT_CONV,
      validateStatus: () => true,
    },
  )

  const html     = String(convRes.data)
  const si       = html.indexOf(def.split.start)
  if (si === -1) throw new Error('Marcador de inicio no encontrado en la respuesta')
  const after    = html.slice(si + def.split.start.length)
  const ei       = after.indexOf(def.split.end)
  if (ei === -1) throw new Error('Marcador de fin no encontrado en la respuesta')
  const raw      = after.slice(0, ei)
  const resultUrl = `https:${raw.replace(/^https?:/, '')}`

  if (resultUrl.includes('undefined') || resultUrl.includes('null')) {
    throw new Error('URL de resultado inválida')
  }

  return resultUrl
}

async function _sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Convierte media usando ezgif.com.
 * Incluye caché LRU, reintentos con backoff y rate limiting implícito.
 */
export async function convert(opts: ConvertOptions): Promise<string> {
  if (!CONVERSIONS[opts.type]) {
    throw new Error(`Tipo de conversión desconocido: "${opts.type}". Tipos: ${types().join(', ')}`)
  }

  const key    = _cacheKey(opts)
  const cached = _cacheGet(key)
  if (cached) return cached

  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await _perform(opts)
      _cacheSet(key, result)
      return result
    } catch (e) {
      lastErr = e
      if (attempt < MAX_RETRIES) await _sleep(RETRY_DELAY * 2 ** attempt)
    }
  }
  throw lastErr
}

/** Lista todos los tipos de conversión disponibles. */
export function types(): ConversionType[] {
  return Object.keys(CONVERSIONS) as ConversionType[]
}

// ─── Atajos ───────────────────────────────────────────────────────────────────

export const webp2mp4  = (url: string) => convert({ type: 'webp-mp4',    url })
export const webp2img  = (url: string) => convert({ type: 'webp-png',    url })
export const webp2gif  = (url: string) => convert({ type: 'webp-gif',    url })
export const img2webp  = (url: string) => convert({ type: 'png-webp',    url })
export const vid2webp  = (url: string) => convert({ type: 'video-webp',  url })
export const gif2mp4   = (url: string) => convert({ type: 'gif-mp4',     url })
export const vid2gif   = (url: string) => convert({ type: 'video-gif',   url })
export const gif2webp  = (url: string) => convert({ type: 'gif-webp',    url })
