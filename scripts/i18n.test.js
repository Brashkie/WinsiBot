// Idiomas (ver src/lib/i18n.ts, i18nDescriptions.ts y el notfound).
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { t, idiomaDe, idiomaPorNumero, leerIdioma, aliasesPara, nombreCategoria, ALIAS_IDIOMA } from '../src/lib/i18n.ts'
import { descripcion, traducidos } from '../src/lib/i18nDescriptions.ts'
import { parecidos, distancia } from '../src/lib/similar.ts'

describe('qué idioma le toca a cada uno', () => {
  it('el elegido gana a todo', () => {
    expect(idiomaDe({ elegido: 'en', numero: '5511999990000', grupo: 'pt' })).toBe('en')
  })

  it('sin elegir, el del país del número', () => {
    expect(idiomaDe({ numero: '5511999990000@s.whatsapp.net' })).toBe('pt')
    expect(idiomaDe({ numero: '12025550123' })).toBe('en')
    expect(idiomaDe({ numero: '51999888777', grupo: 'en' })).toBe('es')
  })

  it('un país de otro idioma, o un número desconocido, usa el del grupo; si no, español', () => {
    expect(idiomaPorNumero('33612345678')).toBeNull()        // Francia
    expect(idiomaDe({ numero: '33612345678', grupo: 'en' })).toBe('en')
    expect(idiomaDe({ numero: '', grupo: 'pt' })).toBe('pt')
    expect(idiomaDe({})).toBe('es')
    expect(idiomaDe({ elegido: 'fr', grupo: 'zz' })).toBe('es')
  })

  it('#idioma entiende cómo lo escribe la gente', () => {
    expect(leerIdioma('Inglés')).toBe('en')
    expect(leerIdioma('pt-BR')).toBe('pt')
    expect(leerIdioma('português')).toBe('pt')
    expect(leerIdioma('ESPAÑOL')).toBe('es')
    expect(leerIdioma('klingon')).toBeNull()
  })
})

describe('textos', () => {
  it('reemplaza las variables y deja las que faltan a la vista', () => {
    expect(t('en', 'err.nivel', { nivel: 5, tuyo: 2 })).toBe('✗ You need level *5*\n§ Your level: 2')
    expect(t('pt', 'cooldown', { s: 3 })).toContain('{cmd}')
  })

  it('ninguna clave queda vacía en ningún idioma, y las variables son las mismas en los tres', () => {
    const fuente = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf-8')
    const claves = [...fuente.matchAll(/^\s+'([\w.]+)':\s+\{ es:/gm)].map(m => m[1])
    expect(claves.length).toBeGreaterThan(30)
    for (const c of claves) {
      const vars = l => [...t(l, c).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join()
      for (const l of ['es', 'en', 'pt']) expect(t(l, c), `${c}/${l}`).not.toBe('')
      expect(vars('en'), c).toBe(vars('es'))
      expect(vars('pt'), c).toBe(vars('es'))
    }
  })

  it('categorías y descripciones, con el español de respaldo', () => {
    expect(nombreCategoria('fun', 'pt')).toBe('DIVERSÃO')
    expect(nombreCategoria('rpg', 'es')).toBe('RPG')
    expect(nombreCategoria('nueva', 'en')).toBe('NUEVA')
    expect(descripcion({ name: 'work', description: 'Trabaja' }, 'en')).toMatch(/^Work/)
    expect(descripcion({ name: 'work', description: 'Trabaja' }, 'es')).toBe('Trabaja')
    expect(descripcion({ name: 'sinTraducir', description: 'Hola' }, 'pt')).toBe('Hola')
  })
})

// Lo que genera `npm run build`: sin él, estos se saltean.
const MANIFIESTO = new URL('../dist/plugins/commands/manifest.json', import.meta.url)
const comandos = existsSync(MANIFIESTO) ? JSON.parse(readFileSync(MANIFIESTO, 'utf-8')).comandos : null

describe.skipIf(!comandos)('contra los comandos de verdad', () => {
  it('cada alias por idioma va a un comando que existe y no le quita el alias a otro', () => {
    const nombres = new Set(comandos.map(c => c.name))
    const duenio = new Map()
    for (const c of comandos) for (const k of [c.name, ...(c.aliases ?? [])]) duenio.set(k, c.name)
    for (const [l, tabla] of Object.entries(ALIAS_IDIOMA)) {
      for (const [alias, nombre] of Object.entries(tabla)) {
        expect(nombres.has(nombre), `${l}:${alias} → ${nombre}`).toBe(true)
        const ya = duenio.get(alias)
        expect(ya === undefined || ya === nombre, `${l}:${alias} ya es de ${ya}`).toBe(true)
      }
    }
  })

  it('cada descripción traducida es de un comando que existe', () => {
    const nombres = new Set(comandos.map(c => c.name))
    for (const n of traducidos()) expect(nombres.has(n), n).toBe(true)
  })

  it('todos los comandos tienen descripción en inglés y portugués', () => {
    const faltan = comandos.filter(c => ['en', 'pt'].some(l => descripcion(c, l) === c.description)).map(c => c.name)
    expect(faltan).toEqual([])
  })

  it('el menú muestra primero los alias del idioma', () => {
    const work = comandos.find(c => c.name === 'work')
    expect(aliasesPara(work, 'pt')[0]).toBe('trabalhar')
    expect(aliasesPara(work, 'es')[0]).toBe(work.aliases[0])
  })

  it('sugiere el comando parecido a uno mal escrito', () => {
    const claves = comandos.flatMap(c => [c.name, ...(c.aliases ?? [])].map(k => [k, c]))
    expect(parecidos('trabajr', claves)).toContain('trabajar')
    expect(parecidos('menú', claves)).toContain('menu')
    expect(parecidos('xyzxyzxyz', claves)).toEqual([])
    expect(distancia('kitten', 'sitting')).toBe(3)
  })
})
