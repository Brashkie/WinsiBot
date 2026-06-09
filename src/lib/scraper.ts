import axios         from 'axios'
import axiosRetry   from 'axios-retry'
import { load }      from 'cheerio'
import { analyzeContent } from './security.js'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — SCRAPER
//  YouTube, Wikipedia, Google, noticias y scraping genérico.
//  Caching TTL 5 min · retry automático · NLP safety check opcional.
// ─────────────────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ─── HTTP client con retry ────────────────────────────────────────────────────

const _http = axios.create({ timeout: 12_000, validateStatus: () => true })
axiosRetry(_http, {
  retries:        2,
  retryDelay:     axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err),
})

// ─── Cache TTL 5 min ──────────────────────────────────────────────────────────

interface CEntry { data: unknown; ts: number }
const _cache    = new Map<string, CEntry>()
const CACHE_TTL = 5 * 60_000

function _cget<T>(key: string): T | null {
  const e = _cache.get(key)
  if (!e || Date.now() - e.ts > CACHE_TTL) return null
  return e.data as T
}
function _cset(key: string, data: unknown): void {
  _cache.set(key, { data, ts: Date.now() })
  if (_cache.size > 200) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < 50; i++) _cache.delete(oldest[i]![0])
  }
}

// ─── Wikipedia ────────────────────────────────────────────────────────────────

export interface WikiResult {
  title:   string
  extract: string
  url:     string
  image?:  string
}

export async function searchWikipedia(query: string, lang = 'es'): Promise<WikiResult | null> {
  const key = `wiki:${lang}:${query}`
  const hit = _cget<WikiResult>(key)
  if (hit) return hit

  const res = await _http.get(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
  )
  if (res.status !== 200) return null

  const d = res.data as Record<string, any>
  const result: WikiResult = {
    title:   d.title   ?? '',
    extract: d.extract ?? '',
    url:     d.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    image:   d.thumbnail?.source,
  }
  _cset(key, result)
  return result
}

// ─── Google ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title:   string
  url:     string
  snippet: string
}

export async function searchGoogle(query: string, count = 5): Promise<SearchResult[]> {
  const key = `google:${query}:${count}`
  const hit = _cget<SearchResult[]>(key)
  if (hit) return hit

  const res = await _http.get('https://www.google.com/search', {
    params:  { q: query, hl: 'es', num: count },
    headers: { 'User-Agent': UA },
  })
  const $       = load(res.data as string)
  const results: SearchResult[] = []
  $('div.g').each((_i, el) => {
    const title   = $(el).find('h3').first().text().trim()
    const url     = $(el).find('a').first().attr('href') ?? ''
    const snippet = $(el).find('.VwiC3b, .IsZvec').first().text().trim()
    if (title && url) results.push({ title, url, snippet })
  })
  const out = results.slice(0, count)
  _cset(key, out)
  return out
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

export interface YTResult {
  title:     string
  videoId:   string
  url:       string
  duration:  string
  views:     string
  thumbnail: string
  channel:   string
}

export async function searchYouTube(query: string, count = 5): Promise<YTResult[]> {
  const key = `yt:${query}:${count}`
  const hit = _cget<YTResult[]>(key)
  if (hit) return hit

  const res = await _http.get('https://www.youtube.com/results', {
    params:  { search_query: query },
    headers: { 'User-Agent': UA },
  })
  const html  = res.data as string
  const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s)
  if (!match) return []

  try {
    const data  = JSON.parse(match[1]!)
    const items: any[] = data
      ?.contents
      ?.twoColumnSearchResultsRenderer
      ?.primaryContents
      ?.sectionListRenderer
      ?.contents?.[0]
      ?.itemSectionRenderer
      ?.contents ?? []

    const out = items
      .filter(i => i?.videoRenderer)
      .slice(0, count)
      .map(i => {
        const v = i.videoRenderer
        return {
          title:     v.title?.runs?.[0]?.text   ?? '',
          videoId:   v.videoId                   ?? '',
          url:       `https://youtu.be/${v.videoId ?? ''}`,
          duration:  v.lengthText?.simpleText    ?? '',
          views:     v.viewCountText?.simpleText ?? '',
          thumbnail: (v.thumbnail?.thumbnails as any[])?.at?.(-1)?.url ?? '',
          channel:   v.ownerText?.runs?.[0]?.text ?? '',
        }
      })
    _cset(key, out)
    return out
  } catch { return [] }
}

// ─── Noticias ─────────────────────────────────────────────────────────────────

export interface NewsItem {
  title:  string
  url:    string
  source: string
}

export async function getNews(query?: string): Promise<NewsItem[]> {
  const key = `news:${query ?? '_home'}`
  const hit = _cget<NewsItem[]>(key)
  if (hit) return hit

  const url = query
    ? `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=es&gl=PE`
    : 'https://news.google.com/home?hl=es&gl=PE'

  const res  = await _http.get(url, { headers: { 'User-Agent': UA } })
  const $    = load(res.data as string)
  const news: NewsItem[] = []

  $('article').slice(0, 10).each((_i, el) => {
    const a      = $(el).find('a').first()
    const title  = a.text().trim()
    const href   = a.attr('href') ?? ''
    const source = $(el).find('cite, time').first().text().trim()
    if (title && href) {
      news.push({
        title,
        url: href.startsWith('/') ? `https://news.google.com${href}` : href,
        source,
      })
    }
  })
  _cset(key, news)
  return news
}

// ─── Scraping genérico ────────────────────────────────────────────────────────

export interface ScrapeResult {
  url:    string
  title:  string
  text:   string
  links:  string[]
  images: string[]
  safe?:  boolean
}

export async function scrapeUrl(url: string, selector = 'body'): Promise<ScrapeResult> {
  const key = `scrape:${url}:${selector}`
  const hit = _cget<ScrapeResult>(key)
  if (hit) return hit

  const res = await _http.get(url, {
    headers:      { 'User-Agent': 'WinsiBot/8.1' },
    responseType: 'text',
  })
  const $      = load(res.data as string)
  $('script, style, nav, footer, header').remove()
  const root   = $(selector)
  const title  = $('title').text().trim()
  const text   = root.text().replace(/\s+/g, ' ').trim().slice(0, 3_000)
  const links  = $('a[href]').map((_i, el) => $(el).attr('href') ?? '').get().filter(Boolean).slice(0, 20)
  const images = $('img[src]').map((_i, el) => $(el).attr('src') ?? '').get().filter(Boolean).slice(0, 10)

  const result: ScrapeResult = { url, title, text, links, images }
  _cset(key, result)
  return result
}

/**
 * Igual que scrapeUrl pero verifica la seguridad del contenido via Rust NLP.
 * `safe: false` indica contenido potencialmente inapropiado.
 */
export async function scrapeUrlSafe(url: string, selector = 'body'): Promise<ScrapeResult> {
  const result = await scrapeUrl(url, selector)
  const check  = await analyzeContent(result.title + ' ' + result.text.slice(0, 200))
  return { ...result, safe: check.isSafe }
}

/** Invalida una entrada de la caché por URL. */
export function clearCache(url?: string): void {
  if (url) {
    for (const k of _cache.keys()) { if (k.includes(url)) _cache.delete(k) }
  } else {
    _cache.clear()
  }
}

/** Stats del caché interno. */
export function cacheStats(): { size: number; keys: string[] } {
  return { size: _cache.size, keys: [..._cache.keys()] }
}
