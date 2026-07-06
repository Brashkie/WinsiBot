import axios from 'axios'
import { config } from '@config'

export interface Rule34Post {
  file_url: string
  width?:   number
  height?:  number
  score?:   number
  tags?:    string
}

const BASE_URL = 'https://api.rule34.xxx/index.php'

/** Busca posts en Rule34 por tags — usa la dapi en modo JSON (sin XML). */
export async function searchRule34(tags: string, limit = 100): Promise<Rule34Post[]> {
  const params: Record<string, string> = {
    page:  'dapi',
    s:     'post',
    q:     'index',
    json:  '1',
    tags,
    limit: String(limit),
  }
  if (config.rule34UserId) params.user_id = config.rule34UserId
  if (config.rule34ApiKey) params.api_key = config.rule34ApiKey

  const res = await axios.get<Rule34Post[] | { post?: Rule34Post[] }>(BASE_URL, {
    params,
    timeout: 15_000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
  })

  const data = res.data
  if (Array.isArray(data)) return data
  return data?.post ?? []
}

export function isImagePost(post: Rule34Post): boolean {
  return /\.(jpe?g|png|gif)$/i.test(post.file_url ?? '')
}

export function isVideoPost(post: Rule34Post): boolean {
  return /\.(mp4|webm)$/i.test(post.file_url ?? '')
}
