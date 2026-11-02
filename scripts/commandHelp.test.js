// La IA ayuda con los comandos (src/lib/commandHelp.ts), con los comandos de
// verdad: los del manifiesto que genera `npm run build`.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { descripcion } from '../src/lib/i18nDescriptions.ts'
import { ayudaDeComandos, bloque, buscar, indexar, preguntaPorElBot } from '../src/lib/commandHelp.ts'

const MANIFIESTO = new URL('../dist/plugins/commands/manifest.json', import.meta.url)
const comandos = existsSync(MANIFIESTO) ? JSON.parse(readFileSync(MANIFIESTO, 'utf8')).comandos : []
const indice = indexar(comandos, (c) => [descripcion(c, 'en'), descripcion(c, 'pt')])
const nombres = (q) => buscar(q, indice).map((c) => c.name)

describe('¿pregunta por el bot?', () => {
  it('sí, cuando lo pide', () => {
    for (const q of ['como descargo una cancion', '¿Cómo hago un sticker?', 'hay algun comando para ver mi perfil',
      'para que sirve el rw', 'qué comandos hay', 'how do I make a sticker', 'como faço figurinha', 'se puede jugar algo?']) {
      expect(preguntaPorElBot(q), q).toBe(true)
    }
  })

  it('no, en una charla normal', () => {
    for (const q of ['que onda gente', 'es temprano todavia', 'para mañana el examen', 'jaja como te va', 'hola bot']) {
      expect(preguntaPorElBot(q), q).toBe(false)
    }
  })
})

describe.skipIf(!comandos.length)('encuentra el comando que sirve', () => {
  it('con los comandos reales', () => {
    // No hay #play: el audio de YouTube es #ytmp3.
    expect(nombres('como descargo una cancion de youtube')).toContain('ytmp3')
    expect(nombres('como quito el fondo de una foto')).toContain('removebg')
    expect(nombres('como veo mi perfil')).toContain('perfil')
    expect(nombres('como hago un sticker con una foto')).toContain('sticker')
    expect(nombres('how do I make a sticker')).toContain('sticker')
    expect(nombres('como faço figurinha')).toContain('sticker')
  })

  it('nunca sugiere comandos de owner ni nsfw', () => {
    const fuera = new Set(comandos.filter((c) => c.category === 'owner' || c.category === 'nsfw').map((c) => c.name))
    for (const q of ['como reinicio el bot', 'como hago broadcast', 'hay comando de porno', 'como uso fetch']) {
      for (const n of nombres(q)) expect(fuera.has(n), `${q} → ${n}`).toBe(false)
    }
  })

  it('a lo más cuatro, y nada si no hay a qué parecerse', () => {
    expect(nombres('como hago para jugar a algo divertido').length).toBeLessThanOrEqual(4)
    expect(nombres('como hago zzqx wvvk')).toEqual([])
    // Un comando de una letra (`c`) no es el comienzo de todo lo que empieza con c.
    expect(nombres('como hago zzqx wvvk cosa')).not.toContain('c')
  })

  it('buscar es barato: menos de 1 ms por búsqueda, aun con la máquina ocupada', () => {
    // Aislado mide ~160 µs; el margen es para cuando corren todos los tests a
    // la vez. Lo que tiene que atrapar es volver a recorrer todo por palabra.
    for (let i = 0; i < 100; i++) buscar('como descargo una cancion de youtube', indice)
    const t = performance.now()
    for (let i = 0; i < 500; i++) buscar('como descargo una cancion de youtube', indice)
    expect((performance.now() - t) / 500).toBeLessThan(1)
  })
})

describe('el bloque para la IA', () => {
  it('con el prefijo del bot y la orden de no inventar', () => {
    const b = bloque([{ name: 'play', description: 'Descarga música', category: 'downloader' }], '#', 'es')
    expect(b).toContain('- #play: Descarga música')
    expect(b).toContain('No inventes comandos')
    expect(bloque([], '#', 'es')).toBe('')
  })

  it('sin pregunta, ni siquiera se busca', async () => {
    let leidos = 0
    const r = await ayudaDeComandos('que onda', 'es', '#', () => { leidos++; return comandos })
    expect(r).toBe('')
    expect(leidos).toBe(0)
  })
})
