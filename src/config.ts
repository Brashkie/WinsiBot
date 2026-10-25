import './lib/env.js'
import type { BotConfig } from './types/index.js'

// Las variables del entorno, con sus valores por defecto. Era un esquema de
// zod, que cargaba ~1,9 MB al arrancar para leer veinte strings; las reglas son
// las mismas: un valor ausente toma el default (uno vacío se respeta, como
// antes), y un NODE_ENV o un MAX_CONTACTS inválido corta el arranque con un
// error claro en vez de seguir con algo que no se pidió.
const e = process.env
const texto = (k: string, def: string): string => e[k] ?? def
const opcional = (k: string): string | undefined => e[k]

function enteroPositivo(k: string, def: number): number {
  const v = e[k]
  if (v === undefined) return def
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`config: ${k} tiene que ser un entero positivo (vino "${v}")`)
  return n
}

function entorno(): 'development' | 'production' {
  const v = e.NODE_ENV ?? 'development'
  if (v !== 'development' && v !== 'production') throw new Error(`config: NODE_ENV tiene que ser development o production (vino "${v}")`)
  return v
}

const env = {
  PREFIX:                texto('PREFIX', '!'),
  BOT_NAME:              texto('BOT_NAME', 'WinsiBot'),
  OWNER_JID:             texto('OWNER_JID', ''),
  SESSION_PATH:          texto('SESSION_PATH', './auth'),
  OPENAI_API_KEY:        opcional('OPENAI_API_KEY'),
  SPOTIFY_CLIENT_ID:     opcional('SPOTIFY_CLIENT_ID'),
  SPOTIFY_CLIENT_SECRET: opcional('SPOTIFY_CLIENT_SECRET'),
  // .env.example documenta SESSION_API_URL/SESSION_API_KEY — RUST_API_URL no
  // es un nombre real que nadie setea, así que leerlo dejaba a config.rustApiUrl
  // siempre en el default aunque el operador cambiara el puerto de Rust.
  SESSION_API_URL:       texto('SESSION_API_URL', 'http://localhost:3001'),
  SESSION_API_KEY:       texto('SESSION_API_KEY', ''),
  DATABASE_URL:          opcional('DATABASE_URL'),
  RULE34_API_KEY:        opcional('RULE34_API_KEY'),
  RULE34_USER_ID:        opcional('RULE34_USER_ID'),
  XBL_API_KEY:           opcional('XBL_API_KEY'),
  NODE_ENV:              entorno(),
  LOG_LEVEL:             texto('LOG_LEVEL', 'info'),
  // JID del canal/newsletter propio para el truco de "Ver canal" en #menu
  // (contexto de reenvío nativo de WhatsApp) — opcional, si el operador no
  // tiene canal propio queda vacío y #menu cae al envío normal sin ese contexto.
  NEWSLETTER_JID:        opcional('NEWSLETTER_JID'),
  // Techo del cache de contactos en memoria (store.ts) — antes era una
  // constante fija (20000); configurable para operadores con cuentas muy
  // grandes que quieran subirlo sin tocar código.
  MAX_CONTACTS:          enteroPositivo('MAX_CONTACTS', 20_000),
}

// Línea de crédito fija — a propósito NO viene de una variable de entorno.
// `config.botName` es lo que el operador personaliza para SU instancia; esto
// es la atribución del framework en sí, y se mantiene aunque el nombre del
// bot cambie (mismo criterio en cualquier fork: el nombre es tuyo, el crédito
// de quién hizo el bot en sí queda).
export const CREDIT_LINE = 'Hepein Oficial x Brashkie'

// User-Agent compartido para scrapers/descargas (rule34, memes, dragoncity,
// etc.) — antes repetido literal en 10 archivos, con riesgo real de
// desincronizarse si alguno se editaba y los demás no.
export const USER_AGENT = `Mozilla/5.0 (compatible; ${env.BOT_NAME}/1.0)`

export const config = {
  prefix: env.PREFIX.split(',').map(p => p.trim()),
  botName:      env.BOT_NAME,
  ownerJid:     env.OWNER_JID.split(',').map(j => j.trim()).filter(Boolean),
  sessionPath:  env.SESSION_PATH,
  rustApiUrl:      env.SESSION_API_URL,
  sessionApiKey:   env.SESSION_API_KEY,
  logLevel:     env.LOG_LEVEL,
  isDev:        env.NODE_ENV === 'development',
  maxContacts:  env.MAX_CONTACTS,
  ...(env.OPENAI_API_KEY        && { openaiKey:           env.OPENAI_API_KEY }),
  ...(env.SPOTIFY_CLIENT_ID     && { spotifyClientId:     env.SPOTIFY_CLIENT_ID }),
  ...(env.SPOTIFY_CLIENT_SECRET && { spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET }),
  ...(env.DATABASE_URL          && { databaseUrl:         env.DATABASE_URL }),
  ...(env.RULE34_API_KEY        && { rule34ApiKey:        env.RULE34_API_KEY }),
  ...(env.RULE34_USER_ID        && { rule34UserId:        env.RULE34_USER_ID }),
  ...(env.XBL_API_KEY           && { xblApiKey:           env.XBL_API_KEY }),
  ...(env.NEWSLETTER_JID        && { newsletterJid:       env.NEWSLETTER_JID }),
} satisfies BotConfig