// La miniatura de una foto que sale (ver src/lib/mediaThumb.ts): que se ponga
// como la ponía Baileys, para que no busque sharp, y que un fallo nunca deje
// el mensaje sin salir.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conMiniatura } from '../src/lib/mediaThumb.ts'
import { imagen } from './fixtures/imageHelpers.js'

const estado = vi.hoisted(() => ({ pedidos: [], falla: false }))
vi.mock('../src/lib/rustHttp.ts', () => ({
  rustHttp: {
    post: async (ruta, _cuerpo, opts) => {
      estado.pedidos.push({ ruta, params: opts?.params })
      if (estado.falla) throw new Error('ECONNREFUSED')
      return { status: 200, data: imagen('small.jpeg') }
    },
  },
}))

describe('conMiniatura', () => {
  beforeEach(() => { estado.pedidos.length = 0; estado.falla = false })

  it('a una foto le pone la miniatura de 32 px y el tamaño de la original', async () => {
    const foto = imagen('size-1536x1024.jpeg')
    const r = await conMiniatura({ image: foto, caption: 'hola' })
    expect(r.caption).toBe('hola')
    expect(r.image).toBe(foto)
    expect(Buffer.from(r.jpegThumbnail, 'base64')).toEqual(imagen('small.jpeg'))
    expect([r.width, r.height]).toEqual([1536, 1024])
    expect(estado.pedidos).toEqual([{ ruta: '/image/convert', params: expect.objectContaining({ formato: 'jpeg', calidad: 50, ancho: 32, ajuste: 'inside' }) }])
  })

  it('una foto desde un archivo se lee y sigue como Buffer', async () => {
    const ruta = new URL('./fixtures/images/size-37x1201.png', import.meta.url)
    const r = await conMiniatura({ image: { url: ruta.href } })
    expect(Buffer.isBuffer(r.image)).toBe(true)
    expect([r.width, r.height]).toEqual([37, 1201])
  })

  it('lo que no es una foto, o ya trae miniatura, no se toca', async () => {
    for (const m of [{ text: 'hola' }, { video: Buffer.alloc(4) }, { image: Buffer.alloc(4), jpegThumbnail: 'x' }]) {
      expect(await conMiniatura(m)).toBe(m)
    }
    expect(estado.pedidos).toHaveLength(0)
  })

  it('si la Session API no responde, la foto sale igual, sin miniatura', async () => {
    estado.falla = true
    const foto = imagen('small.png')
    const r = await conMiniatura({ image: foto })
    expect(r.image).toBe(foto)
    expect(r.jpegThumbnail).toBeUndefined()
  })
})
