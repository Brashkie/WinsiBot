import axios from 'axios'
import { load } from 'cheerio'
import { downloadBuffer } from './downloader.js'

// ─────────────────────────────────────────────────────────────────────────────
//  rule34video.com no tiene API pública — esto scrapea el mismo endpoint
//  interno (AJAX) que usa el buscador del propio sitio, y resuelve la URL de
//  video directa parseando las variables embebidas en la página del video
//  (mismo patrón que usa el proyecto open-source trickerer01/RV). No requiere
//  cuenta ni API key — a diferencia de rule34.xxx, que sí la exige.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://rule34video.com'
const UA       = 'Mozilla/5.0 (compatible; WinsiBot/1.0)'

export interface Rule34VideoSearchResult {
  title:      string
  pageUrl:    string
  thumbnail?: string | undefined
}

/** Busca videos por texto libre — devuelve la lista de resultados de la página de búsqueda. */
export async function searchRule34Video(query: string): Promise<Rule34VideoSearchResult[]> {
  const res = await axios.get(`${BASE_URL}/search/`, {
    params: {
      mode:     'async',
      function: 'get_block',
      block_id: 'custom_list_videos_videos_list_search',
      sort_by:  'post_date',
      q:        query,
    },
    timeout: 15_000,
    headers: { 'User-Agent': UA },
  })

  const $ = load(res.data as string)
  const results: Rule34VideoSearchResult[] = []

  $('a.th.js-open-popup').each((_, el) => {
    const $el     = $(el)
    const pageUrl = $el.attr('href')
    const title   = $el.attr('title')?.trim()
    if (!pageUrl || !title) return
    const thumbnail = $el.find('img.thumb').attr('data-original')
    results.push({ title, pageUrl, thumbnail })
  })

  return results
}

interface VideoQuality {
  url:   string
  label: string
}

// Preferencia de calidad — 480p primero: liviano para mandar por WhatsApp sin
// pegarle a límites de tamaño ni tardar una eternidad en subir. 1080p último
// (solo si no hay otra opción disponible para ese video).
const QUALITY_PREFERENCE = ['480p', '360p', '720p', '1080p']

const QUALITY_FIELDS: Array<[url: string, label: string]> = [
  ['video_url',       'video_url_text'],
  ['video_alt_url',   'video_alt_url_text'],
  ['video_alt_url2',  'video_alt_url2_text'],
  ['video_alt_url3',  'video_alt_url3_text'],
]

/** Extrae la URL directa del .mp4 desde el HTML de la página (variables embebidas en el player). */
function extractVideoUrl(html: string): string | null {
  const qualities: VideoQuality[] = []
  for (const [urlField, labelField] of QUALITY_FIELDS) {
    const urlMatch   = new RegExp(`${urlField}:\\s*'([^']+)'`).exec(html)
    const labelMatch = new RegExp(`${labelField}:\\s*'([^']+)'`).exec(html)
    if (urlMatch?.[1] && labelMatch?.[1]) {
      qualities.push({ url: urlMatch[1], label: labelMatch[1] })
    }
  }
  if (!qualities.length) return null

  for (const pref of QUALITY_PREFERENCE) {
    const match = qualities.find(q => q.label === pref)
    if (match) return match.url
  }
  return qualities[0]!.url
}

export interface Rule34VideoDetails {
  title:       string
  pageUrl:     string
  videoUrl:    string | null
  uploadedAt?: string | undefined  // texto relativo tal cual lo muestra el sitio ("2 days ago")
  views?:      string | undefined
  duration?:   string | undefined
  artist?:     string | undefined  // autor/artista etiquetado (puede diferir de quién lo subió)
  uploader?:   string | undefined  // cuenta que subió el video al sitio
  categories:  string[]
}

/** Trae metadata + resuelve la URL directa del video en un solo fetch de la página. */
export async function getRule34VideoDetails(pageUrl: string): Promise<Rule34VideoDetails | null> {
  const res = await axios.get<string>(pageUrl, { timeout: 15_000, headers: { 'User-Agent': UA } })
  const html = res.data
  const $ = load(html)

  const title = $('h1.title_video').first().text().trim() || $('title').first().text().trim()
  if (!title) return null

  // .info.row trae 3 <span> en orden fijo: fecha, vistas, duración (cada uno
  // con su ícono svg antes — no hay una clase distinta por campo).
  const infoSpans = $('.info.row .item_info span')
  const uploadedAt = infoSpans.eq(0).text().trim() || undefined
  const views       = infoSpans.eq(1).text().trim() || undefined
  const duration    = infoSpans.eq(2).text().trim() || undefined

  const artist = $('.col[data-suggest-type="model"] a.video_meta_pill span.name')
    .first().text().trim() || undefined

  let uploader: string | undefined
  $('.row .col').each((_, el) => {
    const $el = $(el)
    if ($el.find('.label').first().text().trim() === 'Uploaded by') {
      uploader = $el.find('a.video_meta_pill').first().text().trim() || undefined
    }
  })

  const categories: string[] = []
  $('.col[data-suggest-type="category"] a.video_meta_pill span').each((_, el) => {
    const text = $(el).text().trim()
    if (text) categories.push(text)
  })

  return {
    title,
    pageUrl,
    videoUrl: extractVideoUrl(html),
    uploadedAt,
    views,
    duration,
    artist,
    uploader,
    categories,
  }
}

/** Resuelve y descarga el video de una página de resultado — null si algo falla. */
export async function downloadRule34Video(pageUrl: string): Promise<Buffer | null> {
  const details = await getRule34VideoDetails(pageUrl)
  if (!details?.videoUrl) return null
  return downloadBuffer(details.videoUrl)
}
