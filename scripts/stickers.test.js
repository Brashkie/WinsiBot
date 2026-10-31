// Lo del lote de nekos.club: pack y autor de los stickers (#sticker, #take,
// #setmeta), los animados en #toimg, las variables de la bienvenida y los
// días que faltan para un cumpleaños. Y que ningún alias choque entre comandos.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import sharp from 'sharp'
import { escribirExif, leerExif } from '../src/lib/webpExif.ts'
import { leerMeta } from '../src/lib/stickerMeta.ts'
import { esAnimado } from '../src/lib/mime.ts'
import { rellenar } from '../src/lib/welcomeTemplate.ts'
import { diasHasta } from '../src/lib/birthdays.ts'

const BASE = { pack: 'WinsiBot', author: 'Hepein' }

describe('leerMeta', () => {
  it('pack y autor separados por |, con espacios en los nombres', () => {
    expect(leerMeta('Mi Pack Lindo | Juan Pérez', BASE)).toEqual({ pack: 'Mi Pack Lindo', author: 'Juan Pérez' })
  })
  it('lo que falta sale de la base', () => {
    expect(leerMeta('Solo pack', BASE)).toEqual({ pack: 'Solo pack', author: 'Hepein' })
    expect(leerMeta('| Solo autor', BASE)).toEqual({ pack: 'WinsiBot', author: 'Solo autor' })
    expect(leerMeta('   ', BASE)).toEqual(BASE)
  })
  it('un | de más queda en el autor, y los nombres tienen tope', () => {
    expect(leerMeta('a | b | c', BASE).author).toBe('b | c')
    expect(leerMeta('x'.repeat(100), BASE).pack.length).toBe(60)
  })
})

const cuadro = (c) => sharp({ create: { width: 16, height: 16, channels: 4, background: c } }).png().toBuffer()
/** Un WebP fijo, o uno animado de tres cuadros (rojo, verde, azul). */
const webp = async (animado) => animado
  ? sharp([await cuadro('#f00'), await cuadro('#0f0'), await cuadro('#00f')], { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100, 100] }).toBuffer()
  : sharp({ create: { width: 16, height: 16, channels: 4, background: '#f00' } }).webp().toBuffer()

describe('stickers', () => {
  it('esAnimado distingue un WebP animado de uno fijo', async () => {
    expect(esAnimado(await webp(false))).toBe(false)
    const anim = await webp(true)
    expect((await sharp(anim, { animated: true }).metadata()).pages).toBe(3)
    expect(esAnimado(anim)).toBe(true)
    expect(esAnimado(Buffer.from('no es un webp'))).toBe(false)
  })

  it('#take cambia pack y autor sin tocar la imagen, también en un animado', async () => {
    for (const animado of [false, true]) {
      const original = await webp(animado)
      const nuevo = escribirExif(original, { pack: 'Pack de otro', author: 'Yo' })
      const meta = leerExif(nuevo)
      expect(meta['sticker-pack-name']).toBe('Pack de otro')
      expect(meta['sticker-pack-publisher']).toBe('Yo')
      // Los mismos píxeles, cuadro por cuadro: no se recodificó.
      const px = (b) => sharp(b, { animated: true }).raw().toBuffer()
      expect((await px(nuevo)).equals(await px(original))).toBe(true)
      expect(esAnimado(nuevo)).toBe(animado)
    }
  })
})

describe('bienvenida propia', () => {
  it('cambia todas las veces que aparece cada variable', () => {
    expect(rellenar('Hola @user! @user, bienvenid@ a @group (@count). @desc', {
      num: '51999', grupo: 'Los Pibes', desc: 'Reglas: ser buena onda', cuantos: 42,
    })).toBe('Hola @51999! @51999, bienvenid@ a Los Pibes (42). Reglas: ser buena onda')
  })
})

describe('diasHasta', () => {
  const hoy = new Date(2026, 9, 25, 15, 30)
  it('hoy, mañana, y el que ya pasó cae el año que viene', () => {
    expect(diasHasta('25/10', hoy)).toBe(0)
    expect(diasHasta('26/10', hoy)).toBe(1)
    expect(diasHasta('24/10', hoy)).toBe(364)
    expect(diasHasta('01/01', hoy)).toBe(68)
  })
})

const MANIFIESTO = new URL('../dist/plugins/commands/manifest.json', import.meta.url)
describe.skipIf(!existsSync(MANIFIESTO))('el registro de comandos', () => {
  it('ningún nombre ni alias es de dos comandos a la vez (el registro pisaría uno en silencio)', () => {
    const comandos = JSON.parse(readFileSync(MANIFIESTO, 'utf-8')).comandos
    const duenio = new Map()
    const choques = []
    for (const c of comandos) {
      for (const k of [c.name, ...(c.aliases ?? [])]) {
        if (duenio.has(k) && duenio.get(k) !== c.name) choques.push(`${k}: ${duenio.get(k)} y ${c.name}`)
        else duenio.set(k, c.name)
      }
    }
    expect(choques).toEqual([])
  })
})
