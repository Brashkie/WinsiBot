// El login del panel web (src/dashboard/auth.ts).
import { describe, expect, it, vi } from 'vitest'

const guardado = new Map()
vi.mock('@lib/kv.js', () => ({
  kv: { set: (k, v) => guardado.set(k, v), get: (k) => guardado.get(k), delete: (k) => guardado.delete(k) },
}))
vi.mock('@config', () => ({ config: { ownerJid: ['51911111111'] } }))
vi.mock('@lib/owner.js', async () => await import('../src/lib/owner.ts'))

const { startLogin, confirmLogin, checkConfirmed } = await import('../src/dashboard/auth.ts')

describe('login del panel', () => {
  it('el token solo lo recibe el navegador que pidió el código', () => {
    const { code, nonce } = startLogin('51922222222')
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/)
    expect(nonce).toMatch(/^[0-9a-f]{64}$/)
    expect(checkConfirmed(code, nonce)).toBeNull() // todavía sin #login

    expect(confirmLogin(code, '51922222222@s.whatsapp.net', '51922222222')).toBe(true)
    // Quien conozca el código pero no tenga la cookie, nada.
    expect(checkConfirmed(code, undefined)).toBeNull()
    expect(checkConfirmed(code, 'otro')).toBeNull()
    expect(checkConfirmed(code.toLowerCase(), nonce)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('un código lo confirma solo el número que lo pidió', () => {
    const { code } = startLogin('51933333333')
    expect(confirmLogin(code, '51944444444@s.whatsapp.net', '51944444444')).toBe(false)
  })

  it('el dueño configurado con su número suelto entra como owner', () => {
    const { code, nonce } = startLogin('51911111111')
    confirmLogin(code, '51911111111@s.whatsapp.net', '51911111111')
    const token = checkConfirmed(code, nonce)
    expect(guardado.get(`web_session:${token}`)?.role).toBe('owner')
  })

  it('los códigos no se repiten', () => {
    const codigos = new Set(Array.from({ length: 200 }, (_, i) => startLogin(`5190000${String(i).padStart(4, '0')}`).code))
    expect(codigos.size).toBeGreaterThan(195)
  })
})
