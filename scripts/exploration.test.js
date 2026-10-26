// La cueva de #explorar (ver src/lib/exploration.ts y explorationMap.ts): que
// salga siempre igual de la semilla, que todo el suelo se pueda alcanzar, que
// lo agarrado no se vuelva a agarrar, y que la imagen salga.
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  C, ANCHO, ALTO, generar, distancias, nuevaTemporada, mover, repartoReliquia, progreso,
  bitsVacios, poner, tiene, aTexto, deTexto, contar, xy, DIRECCION,
} from '../src/lib/exploration.ts'
import { vistaDe, recorte, svgMapa, imagenMapa } from '../src/lib/explorationMap.ts'

const SEMILLAS = [1, 2, 3, 42, 20261025, 0xdeadbeef]

describe('generar', () => {
  it('la misma semilla da el mismo mapa', () => {
    const a = generar(42)
    const b = generar(42)
    expect(Buffer.from(a.celdas).equals(Buffer.from(b.celdas))).toBe(true)
    expect(Buffer.from(generar(43).celdas).equals(Buffer.from(a.celdas))).toBe(false)
  })

  it('todo el suelo se alcanza desde la entrada, y el borde es pared', () => {
    for (const s of SEMILLAS) {
      const m = generar(s)
      const d = distancias(m.celdas, m.inicio)
      for (let i = 0; i < ANCHO * ALTO; i++) {
        const c = m.celdas[i]
        if (c !== C.Pared && c !== C.Secreta) expect(d[i]).not.toBe(Infinity)
        const { x, y } = xy(i)
        if (x === 0 || y === 0 || x === ANCHO - 1 || y === ALTO - 1) expect(c).toBe(C.Pared)
      }
    }
  })

  it('una reliquia, en lo más lejano, y tres paredes secretas pegadas al suelo', () => {
    for (const s of SEMILLAS) {
      const m = generar(s)
      expect(m.celdas.filter(c => c === C.Reliquia).length).toBe(1)
      expect(m.celdas[m.reliquia]).toBe(C.Reliquia)
      const d = distancias(m.celdas, m.inicio)
      const lejos = Math.max(...[...d].filter(Number.isFinite))
      expect(d[m.reliquia]).toBe(lejos)
      expect(m.celdas.filter(c => c === C.Secreta).length).toBe(3)
    }
  })
})

describe('bitsets', () => {
  it('ida y vuelta por base64', () => {
    const b = bitsVacios()
    for (const i of [0, 7, 8, 799, 1599]) poner(b, i)
    const otra = deTexto(aTexto(b))
    expect(contar(otra)).toBe(5)
    for (const i of [0, 7, 8, 799, 1599]) expect(tiene(otra, i)).toBe(true)
    expect(tiene(otra, 1)).toBe(false)
    expect(aTexto(b).length).toBeLessThan(300)
  })
})

describe('mover', () => {
  it('una pared no mueve; lo agarrado no se vuelve a agarrar', () => {
    const e = nuevaTemporada('123@g.us', 1)
    const m = generar(e.semilla)
    // Ir y volver por todas las casillas al alcance hasta pisar algo.
    let pisado = null
    let r = 12345
    for (let k = 0; k < 20000 && !pisado; k++) {
      r = (Math.imul(r, 1103515245) + 12345) >>> 0
      const dir = 'nseo'[r >>> 30]
      const antes = e.pos
      const ev = mover(e, m, 'a@s', dir)
      if (ev.tipo === 'pared') expect(e.pos).toBe(antes)
      if (['tesoro', 'trampa', 'monstruo', 'fuente'].includes(ev.tipo)) pisado = { pos: e.pos, tipo: ev.tipo }
    }
    expect(pisado).not.toBeNull()
    // Salir y volver a entrar a la misma casilla: ya no hay nada.
    for (const [ida, vuelta] of [['n', 's'], ['s', 'n'], ['e', 'o'], ['o', 'e']]) {
      if (mover(e, m, 'a@s', ida).tipo === 'pared') continue
      expect(mover(e, m, 'a@s', vuelta)).toMatchObject({ tipo: 'nada' })
      expect(e.pos).toBe(pisado.pos)
      break
    }
    expect(e.pasos['a@s']).toBeGreaterThan(0)
  })

  it('las direcciones en los tres idiomas', () => {
    expect(DIRECCION.norte).toBe('n')
    expect(DIRECCION.leste).toBe('e')
    expect(DIRECCION.left).toBe('o')
  })
})

describe('repartoReliquia', () => {
  it('piso para todos, el resto por pasos con tope, extra para quien la encontró', () => {
    const r = repartoReliquia({ a: 150, b: 50, spam: 5000 }, 'b', 10_000)
    expect(r.spam).toBe(r.a) // los 5000 pasos cuentan como 150
    expect(r.b).toBeGreaterThan(r.a) // por el extra de encontrarla
    expect(Object.values(r).every(v => v >= 500)).toBe(true)
  })
})

describe('el dibujo', () => {
  it('trampas y secretas no se ven hasta usarlas', () => {
    const m = generar(7)
    const todo = bitsVacios().fill(255)
    const nada = bitsVacios()
    const trampa = m.celdas.indexOf(C.Trampa)
    const secreta = m.celdas.indexOf(C.Secreta)
    expect(vistaDe(m, todo, nada, trampa)).toBe('suelo')
    expect(vistaDe(m, todo, nada, secreta)).toBe('pared')
    const usadas = bitsVacios()
    poner(usadas, trampa); poner(usadas, secreta)
    expect(vistaDe(m, todo, usadas, trampa)).toBe('trampa')
    expect(vistaDe(m, todo, usadas, secreta)).toBe('secreta')
    expect(vistaDe(m, nada, usadas, trampa)).toBe('oculta')
  })

  it('el recorte tiene 7x7 con el grupo al medio', () => {
    const e = nuevaTemporada('x@g.us', 1)
    const m = generar(e.semilla)
    const filas = recorte(m, e.pos, deTexto(e.vistas), deTexto(e.usadas)).split('\n')
    expect(filas.length).toBe(7)
    expect(filas[3]).toContain('🧭')
  })

  it('el título no mete elementos en el SVG, y la imagen sale', async () => {
    const e = nuevaTemporada('x@g.us', 1)
    const m = generar(e.semilla)
    const svg = svgMapa(m, e.pos, deTexto(e.vistas), deTexto(e.usadas), '<script>', '1%')
    expect(svg).not.toContain('<script>')
    // Con todo visto, las filas juntan casillas iguales: muchos menos de 1600.
    const lleno = svgMapa(m, e.pos, bitsVacios().fill(255), bitsVacios(), 't', 'p')
    expect((lleno.match(/<rect/g) ?? []).length).toBeLessThan(900)
    const img = await imagenMapa(m, e.pos, deTexto(e.vistas), deTexto(e.usadas), 'CUEVA', '1%')
    const meta = await sharp(img).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(ANCHO * 16 + 40)
  })

  it('progreso: al empezar se ve poco, con todo visto es 1', () => {
    const e = nuevaTemporada('x@g.us', 1)
    const m = generar(e.semilla)
    expect(progreso(m, deTexto(e.vistas))).toBeLessThan(0.05)
    expect(progreso(m, bitsVacios().fill(255))).toBe(1)
  })
})
