// La tarjeta de #perfil (ver src/lib/profileCard.ts): los números cortos, que
// lo del usuario no pueda meter elementos en el SVG, y que la imagen se pida
// bien a la Session API.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { corto, svgTarjeta, tarjetaPerfil } from '../src/lib/profileCard.ts'
import { imagen } from './fixtures/imageHelpers.js'

// La imagen la dibuja la Session API (render.rs, con sus tests en Rust): acá
// un rustHttp falso anota qué se le pidió y devuelve un JPEG de prueba.
const pedidos = vi.hoisted(() => [])
vi.mock('../src/lib/rustHttp.ts', () => ({
  rustHttp: {
    post: async (ruta, cuerpo, opts) => {
      pedidos.push({ ruta, cuerpo, params: opts?.params })
      if (ruta === '/image/convert' && !cuerpo.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        throw Object.assign(new Error('HTTP 422'), { response: { status: 422 } })
      }
      return { status: 200, data: imagen('small.jpeg') }
    },
  },
}))

const et = { nivel: 'Nivel', puesto: 'Puesto', experiencia: 'Experiencia', salud: 'Salud', monedas: 'Monedas', oro: 'Oro', dragones: 'Dragones', harem: 'Harem', brasas: 'BrasEmbers', comandos: 'Comandos', pareja: 'Pareja', cumple: 'Cumpleaños' }
const datos = { nombre: 'Ana', rol: 'Guerrero', nivel: 12, exp: 500, expNecesaria: 1000, puesto: 3, salud: 80, monedas: 1_254_300, oro: 9999, dragones: 2, harem: 0, brasas: 1, comandos: 50 }

describe('corto', () => {
  it('los números grandes, cortos', () => {
    expect(corto(9999)).toBe('9.999')
    expect(corto(48_210)).toBe('48,2 mil')
    expect(corto(254_300)).toBe('254 mil')
    expect(corto(1_254_300)).toBe('1,3 M')
    expect(corto(3_000_000_000)).toBe('3,0 B')
  })
})

describe('svgTarjeta', () => {
  it('escapa lo que escribe el usuario', () => {
    const svg = svgTarjeta({ ...datos, nombre: '<b>x</b>', descripcion: '</text><image href="https://mal/x.png"/>', clan: '"&' }, et)
    expect(svg).not.toContain('<image href="https://mal')
    expect(svg).toContain('&lt;/text&gt;&lt;image')
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(svg).toContain('&quot;&amp;')
  })

  it('trae los datos y lo que falta no aparece', () => {
    const svg = svgTarjeta(datos, et)
    expect(svg).toContain('¥1,3 M')
    expect(svg).toContain('500 / 1.000')
    expect(svg).toContain('80/100')
    expect(svg).not.toContain('Pareja')
    expect(svgTarjeta({ ...datos, pareja: 'Leo' }, et)).toContain('Pareja: Leo')
  })

  it('sin foto, la inicial', () => {
    expect(svgTarjeta(datos, et, null)).toContain('>A</text>')
  })
})

describe('tarjetaPerfil', () => {
  beforeEach(() => { pedidos.length = 0 })

  it('con foto: la achica a 200 px y la mete en el SVG, que sale JPEG', async () => {
    const foto = imagen('size-1536x1024.jpeg')
    const img = await tarjetaPerfil(datos, et, foto)
    expect(img.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
    expect(pedidos.map((p) => p.ruta)).toEqual(['/image/convert', '/image/svg'])
    expect(pedidos[0].params).toMatchObject({ formato: 'jpeg', ancho: 200, alto: 200, ajuste: 'cover' })
    const svg = pedidos[1].cuerpo.toString()
    expect(pedidos[1].params).toMatchObject({ formato: 'jpeg', calidad: 88 })
    expect(svg).toContain('width="1000" height="560"')
    // La foto que va en el SVG es la achicada, no la original.
    expect(svg).toContain(imagen('small.jpeg').toString('base64'))
  })

  it('sin foto, o con una que no se puede leer, la tarjeta sale igual (con la inicial)', async () => {
    for (const f of [null, Buffer.from('no es una imagen')]) {
      pedidos.length = 0
      await tarjetaPerfil(datos, et, f)
      const svg = pedidos.at(-1).cuerpo.toString()
      expect(pedidos.at(-1).ruta).toBe('/image/svg')
      expect(svg).toContain('>A</text>')
      expect(svg).not.toContain('<image')
    }
  })
})
