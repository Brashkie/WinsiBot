import { USER_AGENT } from '@config'
import axios from 'axios'
import type { AnyNode, Element } from 'domhandler'

// El HTML se lee con htmlparser2 + css-select, los mismos selectores CSS que
// daba cheerio sin lo que cheerio arrastra (parse5, undici, iconv-lite: 11
// paquetes). Medido después de Baileys, al primer uso: 1,0-1,6 MB y ~60 ms
// contra 7,8-8,5 MB y ~195 ms. Se carga al usarlo, no al arrancar: este
// archivo es el único que parsea HTML.
const parser = () => Promise.all([import('htmlparser2'), import('css-select')])

async function leerHtml(html: string) {
  const [
    {
      parseDocument,
      DomUtils: { textContent, getAttributeValue },
    },
    { selectAll },
  ] = await parser()
  const doc = parseDocument(html)
  const todos = (sel: string, raiz: AnyNode = doc): Element[] => selectAll(sel, raiz)
  const texto = (el: AnyNode | undefined): string => (el ? textContent(el).trim() : '')
  const attr = (el: Element | undefined, nombre: string): string | undefined =>
    el ? getAttributeValue(el, nombre) : undefined
  return { todos, texto, attr }
}

// ─────────────────────────────────────────────────────────────────────────────
//  rule34video.com no tiene API pública — esto scrapea el mismo endpoint
//  interno (AJAX) que usa el buscador del propio sitio, y resuelve la URL de
//  video directa parseando las variables embebidas en la página del video
//  (mismo patrón que usa el proyecto open-source trickerer01/RV). No requiere
//  cuenta ni API key — a diferencia de rule34.xxx, que sí la exige.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://rule34video.com'
const UA = USER_AGENT

export interface Rule34VideoSearchResult {
  title: string
  pageUrl: string
  thumbnail?: string | undefined
}

/** Busca videos por texto libre — devuelve la lista de resultados de la página de búsqueda. */
export async function searchRule34Video(query: string): Promise<Rule34VideoSearchResult[]> {
  const res = await axios.get(`${BASE_URL}/search/`, {
    params: {
      mode: 'async',
      function: 'get_block',
      block_id: 'custom_list_videos_videos_list_search',
      sort_by: 'post_date',
      q: query,
    },
    timeout: 15_000,
    headers: { 'User-Agent': UA },
  })

  return parseSearch(res.data as string)
}

/** Los resultados de la página de búsqueda. Aparte de la descarga para poder probarlo sin red. */
export async function parseSearch(html: string): Promise<Rule34VideoSearchResult[]> {
  const { todos, attr } = await leerHtml(html)
  const results: Rule34VideoSearchResult[] = []

  for (const el of todos('a.th.js-open-popup')) {
    const pageUrl = attr(el, 'href')
    const title = attr(el, 'title')?.trim()
    if (!pageUrl || !title) continue
    const thumbnail = attr(todos('img.thumb', el)[0], 'data-original')
    results.push({ title, pageUrl, thumbnail })
  }

  return results
}

interface VideoQuality {
  url: string
  label: string
}

// Preferencia de calidad — 480p primero: liviano para mandar por WhatsApp sin
// pegarle a límites de tamaño ni tardar una eternidad en subir. 1080p último
// (solo si no hay otra opción disponible para ese video).
const QUALITY_PREFERENCE = ['480p', '360p', '720p', '1080p']

const QUALITY_FIELDS: Array<[url: string, label: string]> = [
  ['video_url', 'video_url_text'],
  ['video_alt_url', 'video_alt_url_text'],
  ['video_alt_url2', 'video_alt_url2_text'],
  ['video_alt_url3', 'video_alt_url3_text'],
]

/** Extrae la URL directa del .mp4 desde el HTML de la página (variables embebidas en el player). */
function extractVideoUrl(html: string): string | null {
  const qualities: VideoQuality[] = []
  for (const [urlField, labelField] of QUALITY_FIELDS) {
    const urlMatch = new RegExp(`${urlField}:\\s*'([^']+)'`).exec(html)
    const labelMatch = new RegExp(`${labelField}:\\s*'([^']+)'`).exec(html)
    if (urlMatch?.[1] && labelMatch?.[1]) {
      qualities.push({ url: urlMatch[1], label: labelMatch[1] })
    }
  }
  if (!qualities.length) return null

  for (const pref of QUALITY_PREFERENCE) {
    const match = qualities.find((q) => q.label === pref)
    if (match) return match.url
  }
  return qualities[0]!.url
}

export interface Rule34VideoDetails {
  title: string
  pageUrl: string
  videoUrl: string | null
  uploadedAt?: string | undefined // texto relativo tal cual lo muestra el sitio ("2 days ago")
  views?: string | undefined
  duration?: string | undefined
  artist?: string | undefined // autor/artista etiquetado (puede diferir de quién lo subió)
  uploader?: string | undefined // cuenta que subió el video al sitio
  categories: string[]
}

/** Trae metadata + resuelve la URL directa del video en un solo fetch de la página. */
export async function getRule34VideoDetails(pageUrl: string): Promise<Rule34VideoDetails | null> {
  const res = await axios.get<string>(pageUrl, { timeout: 15_000, headers: { 'User-Agent': UA } })
  return parseDetails(res.data, pageUrl)
}

/** La metadata de la página de un video. Aparte de la descarga para poder probarlo sin red. */
export async function parseDetails(
  html: string,
  pageUrl: string,
): Promise<Rule34VideoDetails | null> {
  const { todos, texto } = await leerHtml(html)

  const title = texto(todos('h1.title_video')[0]) || texto(todos('title')[0])
  if (!title) return null

  // .info.row trae 3 <span> en orden fijo: fecha, vistas, duración (cada uno
  // con su ícono svg antes — no hay una clase distinta por campo).
  const infoSpans = todos('.info.row .item_info span')
  const uploadedAt = texto(infoSpans[0]) || undefined
  const views = texto(infoSpans[1]) || undefined
  const duration = texto(infoSpans[2]) || undefined

  const artist =
    texto(todos('.col[data-suggest-type="model"] a.video_meta_pill span.name')[0]) || undefined

  let uploader: string | undefined
  for (const el of todos('.row .col')) {
    if (texto(todos('.label', el)[0]) === 'Uploaded by') {
      uploader = texto(todos('a.video_meta_pill', el)[0]) || undefined
    }
  }

  const categories: string[] = []
  for (const el of todos('.col[data-suggest-type="category"] a.video_meta_pill span')) {
    const text = texto(el)
    if (text) categories.push(text)
  }

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
