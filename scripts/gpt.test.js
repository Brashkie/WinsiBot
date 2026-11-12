// #gpt (src/plugins/commands/ai/gpt.ts): primero la IA local, OpenAI solo si
// no contesta y hay clave.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ local: null, openai: 0, clave: '', pedidosLocales: [] }))
vi.mock('@config', () => ({ config: { get openaiKey() { return estado.clave }, botName: 'Winsi' } }))
vi.mock('@lib/cacheManager.js', () => ({
  createCache: () => new Map(),
  registerCache: (_n, c) => c,
}))
vi.mock('@lib/localChat.js', () => ({
  chatLocal: async (mensajes) => { estado.pedidosLocales.push(mensajes.map(m => m.content)); return estado.local },
}))
vi.mock('@lib/openai.js', () => ({ chat: async () => { estado.openai++; return 'de OpenAI' } }))

const { default: gpt } = await import('../src/plugins/commands/ai/gpt.ts')

function sock() {
  const enviados = []
  return { enviados, sendMessage: async (_jid, m) => enviados.push(m.text), sendPresenceUpdate: async () => {} }
}
const correr = (s, texto, sender = 'u1') => gpt.execute({ sock: s, jid: 'g', msg: {}, args: texto.split(' '), sender, command: 'gpt' })

describe('#gpt', () => {
  beforeEach(() => { estado.local = null; estado.openai = 0; estado.clave = ''; estado.pedidosLocales.length = 0 })

  it('contesta la IA local, sin OpenAI, y recuerda la conversación', async () => {
    const s = sock()
    estado.local = 'hola, soy local'
    await correr(s, 'hola', 'a')
    await correr(s, 'y ahora?', 'a')
    expect(s.enviados).toEqual(['hola, soy local', 'hola, soy local'])
    expect(estado.openai).toBe(0)
    expect(estado.pedidosLocales[1].slice(1)).toEqual(['hola', 'hola, soy local', 'y ahora?'])
  })

  it('sin IA local y sin clave: lo dice, y no deja el mensaje colgado en el historial', async () => {
    const s = sock()
    await correr(s, 'hola', 'b')
    expect(s.enviados[0]).toMatch(/no está disponible/)
    estado.local = 'ya estoy'
    await correr(s, 'otra', 'b')
    expect(estado.pedidosLocales.at(-1).slice(1)).toEqual(['otra'])
  })

  it('sin IA local y con clave: OpenAI', async () => {
    const s = sock()
    estado.clave = 'sk-x'
    await correr(s, 'hola', 'c')
    expect(s.enviados).toEqual(['de OpenAI'])
    expect(estado.openai).toBe(1)
  })
})
