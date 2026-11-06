// Lo que sale del bot pasa por el embudo (src/core/egress.ts), que tapa los
// números de la gente. Sin Session API —como acá— decide la copia en
// TypeScript de Phone_Guard, con la misma regla.
import { beforeAll, describe, expect, it, vi } from 'vitest'

const owner = '51900000001@s.whatsapp.net'
vi.mock('@config', () => ({ config: { ownerJid: [owner], prefix: ['#'] } }))
vi.mock('@lib/owner.js', async () => await import('../src/lib/owner.ts'))
vi.mock('@lib/mentions.js', async () => await import('../src/lib/mentions.ts'))
vi.mock('@lib/phoneGuard.js', async () => await import('../src/lib/phoneGuard.ts'))
vi.mock('@lib/mediaThumb.js', async () => await import('../src/lib/mediaThumb.ts'))
vi.mock('@lib/session.js', () => ({
  sessionClient: { antibanPermit: async () => null, antibanReport: async () => {} },
}))
vi.mock('@lib/rateLimiter.js', () => ({ rateLimiter: { directForJid: (_to, fn) => fn() } }))
vi.mock('../src/core/logger.ts', () => ({ logger: { debug() {}, info() {}, warn() {}, error() {} } }))
vi.mock('../src/core/store.ts', () => ({ winsiStore: { resolveJid: (j) => ({ jid: j, name: '' }) } }))

const { wrapEgress } = await import('../src/core/egress.ts')
const { conocer } = await import('../src/lib/phoneGuard.ts')

function socketFalso() {
  const enviados = []
  const sock = { sendMessage: async (jid, content) => { enviados.push({ jid, content }); return { key: { id: 'x' } } } }
  wrapEgress(sock, 'test')
  return { sock, enviados }
}

beforeAll(() => {
  conocer('51924360740@s.whatsapp.net')
  conocer('31908117356669@lid')
})

describe('el embudo tapa los números de la gente', () => {
  it('en un grupo, los tapa', async () => {
    const { sock, enviados } = socketFalso()
    await sock.sendMessage('120363363621316758@g.us', { text: 'el de Juan es +51 924 360 740, ganó 10000000000 monedas' })
    expect(enviados[0].content.text).toBe('el de Juan es 51••••••740, ganó 10000000000 monedas')
  })

  it('también en el pie de una foto', async () => {
    const { sock, enviados } = socketFalso()
    await sock.sendMessage('120363363621316758@g.us', { image: Buffer.from(''), caption: 'LID 31908117356669' })
    expect(enviados[0].content.caption).toBe('LID 31•••••••••669')
  })

  it('no tapa a quien recibe el privado', async () => {
    const { sock, enviados } = socketFalso()
    await sock.sendMessage('51924360740@s.whatsapp.net', { text: 'tu número es 51924360740 y el otro 31908117356669' })
    expect(enviados[0].content.text).toBe('tu número es 51924360740 y el otro 31•••••••••669')
  })

  it('al owner, en su privado, nada', async () => {
    const { sock, enviados } = socketFalso()
    await sock.sendMessage('51900000001@s.whatsapp.net', { text: 'reportado 51924360740' })
    expect(enviados[0].content.text).toBe('reportado 51924360740')
  })

  it('una mención de verdad queda', async () => {
    const { sock, enviados } = socketFalso()
    await sock.sendMessage('120363363621316758@g.us', {
      text: 'hola @51924360740', mentions: ['51924360740@s.whatsapp.net'],
    })
    expect(enviados[0].content.text).toBe('hola @51924360740')
  })
})
