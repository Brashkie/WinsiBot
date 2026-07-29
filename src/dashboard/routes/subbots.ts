import { Hono } from 'hono'
import { z } from 'zod'
import {
  subBots, startSubBot, stopSubBot,
  applySubBotName, applySubBotMedia,
} from '@plugins/commands/jadibot/serbot.js'
import { getSessionFrom } from '../middleware.js'
import { getMainSock } from '../mainSock.js'

export const subbotsRoutes = new Hono()

// Solo el dueño del sub-bot (o el owner del bot) puede tocarlo.
function ownsSubBot(phone: string, jid: string, role: string): boolean {
  if (role === 'owner') return true
  const bot = subBots.get(phone)
  return !!bot && (bot.ownerJid === jid || bot.phone === jid.split('@')[0]?.split(':')[0])
}

subbotsRoutes.post('/:phone/connect', async (c) => {
  const session = getSessionFrom(c)
  const phone   = c.req.param('phone')

  if (!ownsSubBot(phone, session.jid, session.role) && phone !== session.jid.split('@')[0]) {
    return c.json({ error: 'No autorizado' }, 403)
  }

  const sock = getMainSock()
  if (!sock) return c.json({ error: 'Bot principal no disponible' }, 503)

  if (subBots.get(phone)?.status === 'connected') {
    return c.json({ error: 'Ese sub-bot ya está conectado' }, 409)
  }

  // Misma ruta que #serbot desde WhatsApp — el QR/código se manda al DM del
  // usuario con el bot principal. Ver nota en el plan: renderizar el QR
  // directo en el navegador implica tocar la emisión interna de
  // startSubBot(), que ya tiene mucho ajuste fino de reconexión/Bad MAC — se
  // deja para una iteración aparte, no vale el riesgo en este pase.
  startSubBot(phone, 'code', sock, session.jid, null, session.jid).catch(() => {})

  return c.json({ ok: true, message: 'Revisá tu WhatsApp — te mandamos el código de vinculación ahí.' })
})

subbotsRoutes.post('/:phone/disconnect', async (c) => {
  const session = getSessionFrom(c)
  const phone   = c.req.param('phone')

  if (!ownsSubBot(phone, session.jid, session.role)) return c.json({ error: 'No autorizado' }, 403)

  const ok = await stopSubBot(phone)
  return ok ? c.json({ ok: true }) : c.json({ error: 'Sub-bot no encontrado' }, 404)
})

const setNameSchema = z.object({ name: z.string().min(1).max(48) })

subbotsRoutes.post('/:phone/setname', async (c) => {
  const session = getSessionFrom(c)
  const phone   = c.req.param('phone')
  if (!ownsSubBot(phone, session.jid, session.role)) return c.json({ error: 'No autorizado' }, 403)

  const body = await c.req.json().catch(() => null)
  const parsed = setNameSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Nombre inválido' }, 400)

  applySubBotName(phone, parsed.data.name.trim())
  return c.json({ ok: true })
})

subbotsRoutes.post('/:phone/setmedia', async (c) => {
  const session = getSessionFrom(c)
  const phone   = c.req.param('phone')
  if (!ownsSubBot(phone, session.jid, session.role)) return c.json({ error: 'No autorizado' }, 403)

  const form = await c.req.formData().catch(() => null)
  const key  = (form?.get('key') as string ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const file = form?.get('file')

  if (!key)                          return c.json({ error: 'Falta la clave' }, 400)
  if (!(file instanceof File))       return c.json({ error: 'Falta el archivo' }, 400)
  if (file.size > 20 * 1024 * 1024)  return c.json({ error: 'Archivo muy grande (máx 20MB)' }, 400)

  const isVideo = file.type.startsWith('video/')
  const isImage = file.type.startsWith('image/')
  if (!isVideo && !isImage) return c.json({ error: 'Solo imágenes o videos' }, 400)

  const buffer = Buffer.from(await file.arrayBuffer())
  applySubBotMedia(phone, key, buffer, isVideo ? 'mp4' : 'jpg')

  return c.json({ ok: true })
})
