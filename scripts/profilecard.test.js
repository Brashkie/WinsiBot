// La tarjeta de #perfil (ver src/lib/profileCard.ts): los números cortos, que
// lo del usuario no pueda meter elementos en el SVG, y que la imagen salga.
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { corto, svgTarjeta, tarjetaPerfil } from '../src/lib/profileCard.ts'

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
  it('sale un JPEG de 1000x560, con foto y sin foto', async () => {
    const foto = await sharp({ create: { width: 640, height: 640, channels: 3, background: '#3a6' } }).jpeg().toBuffer()
    for (const f of [foto, null]) {
      const img = await tarjetaPerfil(datos, et, f)
      const meta = await sharp(img).metadata()
      expect(meta.format).toBe('jpeg')
      expect([meta.width, meta.height]).toEqual([1000, 560])
    }
  })

  it('una foto que no se puede leer no rompe la tarjeta', async () => {
    const img = await tarjetaPerfil(datos, et, Buffer.from('no es una imagen'))
    expect((await sharp(img).metadata()).format).toBe('jpeg')
  })
})
