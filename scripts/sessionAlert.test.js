// El aviso de sesión expulsada (src/core/sessionAlert.ts).
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Una ruta temporal: el test no puede tocar la nota de verdad del bot.
const ARCHIVO = join(tmpdir(), `winsi-session-alert-${process.pid}`, 'session-closed.json')
process.env.WINSI_SESSION_ALERT_FILE = ARCHIVO

vi.mock('@config', () => ({ config: { ownerJid: ['51911111111', '777@lid', '5491122223333@s.whatsapp.net'] } }))
vi.mock('@core/logger.js', () => ({ logger: { warn: () => {} } }))

const { anotarExpulsion, avisarSiHubo, textoDeExpulsion } = await import('../src/core/sessionAlert.ts')
afterEach(() => rmSync(ARCHIVO, { force: true }))

describe('aviso de sesión expulsada', () => {
  it('un 440 dice que fue otra conexión con las mismas credenciales, no WhatsApp Web', () => {
    const t = textoDeExpulsion({ code: 440, at: 0 })
    expect(t).toContain('mismas credenciales')
    expect(t).not.toContain('WhatsApp Web')
    expect(textoDeExpulsion({ code: 401, at: 0 })).toContain('se desvinculó')
  })

  it('se anota, se avisa a cada dueño por su teléfono y se borra la nota', async () => {
    anotarExpulsion(440)
    expect(existsSync(ARCHIVO)).toBe(true)
    const enviados = []
    const sock = { sendMessage: async (jid, m) => enviados.push([jid, m.text]) }
    await avisarSiHubo(sock)
    expect(enviados.map(([j]) => j)).toEqual(['51911111111@s.whatsapp.net', '5491122223333@s.whatsapp.net'])
    expect(enviados[0][1]).toContain('Alerta de seguridad')
    expect(existsSync(ARCHIVO)).toBe(false)
    // Sin nota, no se avisa nada.
    await avisarSiHubo(sock)
    expect(enviados).toHaveLength(2)
  })
})
