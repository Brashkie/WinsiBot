// Buscar una canción en Spotify (#spotify), con el fetch de Node.
//
// El SDK oficial (@spotify/web-api-ts-sdk) se usaba para una sola búsqueda:
// pedir un token con las credenciales de la app y llamar a /search. El token
// dura una hora y se reusa hasta un minuto antes de vencer.

import { config } from '@config'

export interface Pista {
  name:          string
  duration_ms:   number
  artists:       Array<{ name: string }>
  album:         { name: string; release_date: string; images: Array<{ url: string }> }
  external_urls: { spotify: string }
}

let token: { valor: string; vence: number } | null = null

async function tokenDeApp(): Promise<string> {
  if (token && Date.now() < token.vence) return token.valor
  const basic = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
    signal:  AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Spotify: token HTTP ${res.status}`)
  const d = await res.json() as { access_token: string; expires_in: number }
  token = { valor: d.access_token, vence: Date.now() + (d.expires_in - 60) * 1000 }
  return token.valor
}

export async function buscarPista(q: string): Promise<Pista | undefined> {
  const res = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`, {
    headers: { authorization: `Bearer ${await tokenDeApp()}` },
    signal:  AbortSignal.timeout(10_000),
  })
  if (res.status === 401) token = null   // revocado antes de tiempo: el próximo pide otro
  if (!res.ok) throw new Error(`Spotify: búsqueda HTTP ${res.status}`)
  return ((await res.json()) as { tracks: { items: Pista[] } }).tracks.items[0]
}
