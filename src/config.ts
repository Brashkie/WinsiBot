import 'dotenv/config'
import { z } from 'zod'
import type { BotConfig } from './types/index.js'

const envSchema = z.object({
  PREFIX:                z.string().default('!'),
  BOT_NAME:              z.string().default('WinsiBot'),
  OWNER_JID:             z.string().default(''),
  SESSION_PATH:          z.string().default('./auth'),
  OPENAI_API_KEY:        z.string().optional(),
  SPOTIFY_CLIENT_ID:     z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  PYTHON_API_URL:        z.string().default('http://localhost:5000'),
  PHP_API_URL:           z.string().default('http://localhost:8080'),
  RUST_API_URL:          z.string().default('http://localhost:3001'),
  DATABASE_URL:          z.string().optional(),
  REDIS_URL:             z.string().default('redis://localhost:6379'),
  RULE34_API_KEY:        z.string().optional(),
  RULE34_USER_ID:        z.string().optional(),
  XBL_API_KEY:           z.string().optional(),
  NODE_ENV:              z.enum(['development', 'production']).default('development'),
  LOG_LEVEL:             z.string().default('info'),
  // JID del canal/newsletter propio para el truco de "Ver canal" en #menu
  // (contexto de reenvío nativo de WhatsApp) — opcional, si el operador no
  // tiene canal propio queda vacío y #menu cae al envío normal sin ese contexto.
  NEWSLETTER_JID:        z.string().optional(),
  // Techo del cache de contactos en memoria (store.ts) — antes era una
  // constante fija (20000); configurable para operadores con cuentas muy
  // grandes que quieran subirlo sin tocar código.
  MAX_CONTACTS:          z.coerce.number().int().positive().default(20_000),
})

const env = envSchema.parse(process.env)

// Línea de crédito fija — a propósito NO viene de una variable de entorno.
// `config.botName` es lo que el operador personaliza para SU instancia; esto
// es la atribución del framework en sí, y se mantiene aunque el nombre del
// bot cambie (mismo criterio en cualquier fork: el nombre es tuyo, el crédito
// de quién hizo el bot en sí queda).
export const CREDIT_LINE = 'Hepein Oficial x Brashkie'

export const config = {
  prefix: env.PREFIX.split(',').map(p => p.trim()),
  botName:      env.BOT_NAME,
  ownerJid:     env.OWNER_JID.split(',').map(j => j.trim()).filter(Boolean),
  sessionPath:  env.SESSION_PATH,
  pythonApiUrl: env.PYTHON_API_URL,
  phpApiUrl:    env.PHP_API_URL,
  rustApiUrl:   env.RUST_API_URL,
  redisUrl:     env.REDIS_URL,
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