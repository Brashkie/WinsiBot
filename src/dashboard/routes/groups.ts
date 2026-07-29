import { Hono } from 'hono'
import { z } from 'zod'
import { getGroupConfig, setGroupConfig } from '@core/events.js'
import { OPTIONS, type BoolKey } from '@lib/groupToggles.js'
import { getSessionFrom } from '../middleware.js'
import { getAdminGroups, isGroupAdmin } from '../groupsInfo.js'
import { broadcast } from '../ws.js'

export const groupsRoutes = new Hono()

async function requireGroupAdmin(jid: string, groupJid: string, role: string): Promise<boolean> {
  if (role === 'owner') return true
  return isGroupAdmin(groupJid, jid)
}

groupsRoutes.get('/', async (c) => {
  const session = getSessionFrom(c)
  const groups  = await getAdminGroups(session.role === 'owner' ? null : session.jid)
  return c.json(groups)
})

groupsRoutes.get('/:jid/config', async (c) => {
  const session  = getSessionFrom(c)
  const groupJid = c.req.param('jid')

  if (!await requireGroupAdmin(session.jid, groupJid, session.role)) {
    return c.json({ error: 'No sos admin de ese grupo' }, 403)
  }

  const cfg = getGroupConfig(groupJid)
  const options = Object.values(OPTIONS).filter(o => !o.ownerOnly || session.role === 'owner')
  const values: Record<string, boolean> = {}
  for (const opt of options) values[opt.key] = Boolean((cfg as any)[opt.key])

  return c.json({
    options: options.map(o => ({ key: o.key, label: o.label, description: o.description, ownerOnly: o.ownerOnly })),
    values,
  })
})

const patchSchema = z.object({ key: z.string(), value: z.boolean() })

groupsRoutes.patch('/:jid/config', async (c) => {
  const session  = getSessionFrom(c)
  const groupJid = c.req.param('jid')

  if (!await requireGroupAdmin(session.jid, groupJid, session.role)) {
    return c.json({ error: 'No sos admin de ese grupo' }, 403)
  }

  const body   = await c.req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Body inválido' }, 400)

  const { key, value } = parsed.data
  const option = OPTIONS[key]
  if (!option) return c.json({ error: `Opción desconocida: ${key}` }, 400)
  if (option.ownerOnly && session.role !== 'owner') return c.json({ error: 'Solo el owner puede cambiar esto' }, 403)

  // Misma fuente de verdad que #on/#off y los comandos individuales
  // (#antilink, etc.) — cero divergencia entre la web y WhatsApp.
  setGroupConfig(groupJid, { [key as BoolKey]: value })
  broadcast('group_config', { jid: groupJid, key, value })

  return c.json({ ok: true })
})
