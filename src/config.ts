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
  NODE_ENV:              z.enum(['development', 'production']).default('development'),
  LOG_LEVEL:             z.string().default('info'),
})

const env = envSchema.parse(process.env)

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
  ...(env.OPENAI_API_KEY        && { openaiKey:           env.OPENAI_API_KEY }),
  ...(env.SPOTIFY_CLIENT_ID     && { spotifyClientId:     env.SPOTIFY_CLIENT_ID }),
  ...(env.SPOTIFY_CLIENT_SECRET && { spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET }),
  ...(env.DATABASE_URL          && { databaseUrl:         env.DATABASE_URL }),
  ...(env.RULE34_API_KEY        && { rule34ApiKey:        env.RULE34_API_KEY }),
  ...(env.RULE34_USER_ID        && { rule34UserId:        env.RULE34_USER_ID }),
} satisfies BotConfig