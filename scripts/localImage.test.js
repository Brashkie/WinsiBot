// Crear una imagen con Cosxamix (src/lib/localImage.ts), con un fetch falso.
import { describe, expect, it } from 'vitest'
import { aIngles, imagenLocal } from '../src/lib/localImage.ts'

function falso(respuestas) {
  const pedidos = []
  const f = async (url, init) => {
    pedidos.push({ url, cuerpo: JSON.parse(init.body) })
    const r = respuestas.shift()
    if (r instanceof Error) throw r
    return r
  }
  return { f, pedidos }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

describe('aIngles', () => {
  it('traduce con la IA local y devuelve solo la traducción', async () => {
    const { f, pedidos } = falso([json({ choices: [{ message: { content: '"a cat astronaut"' } }] })])
    expect(await aIngles('un gato astronauta', f)).toBe('a cat astronaut')
    expect(pedidos[0].url).toMatch(/\/v1\/chat\/completions$/)
    expect(pedidos[0].cuerpo.messages.at(-1).content).toBe('un gato astronauta')
  })

  it('lo que ya está en inglés no se manda', async () => {
    const { f, pedidos } = falso([])
    expect(await aIngles('a cabin in the snow', f)).toBe('a cabin in the snow')
    expect(pedidos).toHaveLength(0)
  })

  it('si la IA no contesta, va el texto como vino', async () => {
    const { f } = falso([new Error('ECONNREFUSED')])
    expect(await aIngles('un gato', f)).toBe('un gato')
    const { f: f2 } = falso([json({}, 500)])
    expect(await aIngles('un gato', f2)).toBe('un gato')
  })
})

describe('imagenLocal', () => {
  it('devuelve el PNG con lo que tardó y la semilla', async () => {
    const png = Buffer.from('\x89PNG falso')
    const { f, pedidos } = falso([new Response(png, { headers: { 'content-type': 'image/png', 'x-cosxamix-ms': '16636', 'x-cosxamix-seed': '7' } })])
    const r = await imagenLocal('a cat', f)
    expect(r.png).toEqual(png)
    expect([r.ms, r.semilla]).toEqual([16636, '7'])
    expect(pedidos[0].url).toMatch(/\/api\/image$/)
    expect(pedidos[0].cuerpo).toEqual({ prompt: 'a cat' })
  })

  it('sin modelo de imágenes (404) o sin Cosxamix: null, para probar lo siguiente', async () => {
    const { f } = falso([new Response('no hay modelo', { status: 404 })])
    expect(await imagenLocal('a cat', f)).toBeNull()
    const { f: f2 } = falso([new Error('ECONNREFUSED')])
    expect(await imagenLocal('a cat', f2)).toBeNull()
  })
})

describe('qué se traduce', () => {
  it('"a" sola no cuenta como inglés: "un gato a la luna" se traduce', async () => {
    const { f, pedidos } = falso([json({ choices: [{ message: { content: 'a cat to the moon' } }] })])
    expect(await aIngles('un gato a la luna', f)).toBe('a cat to the moon')
    expect(pedidos).toHaveLength(1)
  })
})
