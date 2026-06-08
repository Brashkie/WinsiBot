import axios         from 'axios'
import { load }      from 'cheerio'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — SCRAPER
//  YouTube, Wikipedia, Google, noticias y scraping genérico con cheerio.
// ─────────────────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// ─── Wikipedia ────────────────────────────────────────────────────────────────

export interface WikiResult {
  title:   string
  extract: string
  url:     string
  image?:  string
}

export async function searchWikipedia(query: string, lang = 'es'): Promise<WikiResult | null> {
  const res = await axios.get(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
    { timeout: 8_000, validateStatus: () => true },
  )
  if (res.status !== 200) return null
  const d = res.data as Record<string, any>
  return {
    title:   d.title ?? '',
    extract: d.extract ?? '',
    url:     d.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    image:   d.thumbnail?.source,
  }
}

// ─── Google ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title:   string
  url:     string
  snippet: string
}

export async function searchGoogle(query: string, count = 5): Promise<SearchResult[]> {
  const res = await axios.get('https://www.google.com/search', {
    params:  { q: query, hl: 'es', num: count },
    headers: { 'User-Agent': UA },
    timeout: 10_000,
    validateStatus: () => true,
  })
  const $       = load(res.data as string)
  const results: SearchResult[] = []
  $('div.g').each((_i, el) => {
    const title   = $(el).find('h3').first().text().trim()
    const url     = $(el).find('a').first().attr('href') ?? ''
    const snippet = $(el).find('.VwiC3b, .IsZvec').first().text().trim()
    if (title && url) results.push({ title, url, snippet })
  })
  return results.slice(0, count)
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
  const res = await axios.get('https://www.youtube.com/results', {
    params:  { search_query: query },
    headers: { 'User-Agent': UA },
    timeout: 12_000,
    validateStatus: () => true,
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
    return items
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
  } catch { return [] }
}

// ─── Noticias ─────────────────────────────────────────────────────────────────

export interface NewsItem {
  title:  string
  url:    string
  source: string
}

export async function getNews(query?: string): Promise<NewsItem[]> {
  const url = query
    ? `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=es&gl=PE`
    : 'https://news.google.com/home?hl=es&gl=PE'
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 10_000,
    validateStatus: () => true,
  })
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
  return news
}

// ─── Scraping genérico ────────────────────────────────────────────────────────

export interface ScrapeResult {
  url:    string
  title:  string
  text:   string
  links:  string[]
  images: string[]
}

export async function scrapeUrl(url: string, selector = 'body'): Promise<ScrapeResult> {
  const res = await axios.get(url, {
    headers:      { 'User-Agent': 'WinsiBot/8.1' },
    timeout:      15_000,
    responseType: 'text',
    validateStatus: () => true,
  })
  const $ = load(res.data as string)
  $('script, style, nav, footer, header').remove()
  const root   = $(selector)
  const title  = $('title').text().trim()
  const text   = root.text().replace(/\s+/g, ' ').trim().slice(0, 3_000)
  const links  = $('a[href]').map((_i, el) => $(el).attr('href') ?? '').get().filter(Boolean).slice(0, 20)
  const images = $('img[src]').map((_i, el) => $(el).attr('src') ?? '').get().filter(Boolean).slice(0, 10)
  return { url, title, text, links, images }
}
