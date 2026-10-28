// Cuándo arranca el bot a Cosxamix (ver src/lib/cosxamixLaunch.ts): solo si
// el .env apunta a uno local, con binario y con el modelo que se va a pedir, y
// sin relanzarlo en bucle si se cae una y otra vez.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { pedido, planear, reintentar, rutas } from '../src/lib/cosxamixLaunch.ts'

const MODELO = 'qwen2.5-3b-instruct-q3_k_m'
const env = { OLLAMA_URL: 'http://127.0.0.1:11435', OLLAMA_MODEL: MODELO }
const ROOT = join('C:', 'bot')

describe('pedido', () => {
  it('un Cosxamix en esta máquina', () => {
    expect(pedido(env)).toEqual({ puerto: '11435', modelo: MODELO })
    expect(pedido({ ...env, OLLAMA_URL: 'http://localhost:11435/' })).not.toBeNull()
  })

  it('Ollama u otra máquina: no es para arrancar', () => {
    expect(pedido({ ...env, OLLAMA_URL: 'http://localhost:11434' })).toBeNull()
    expect(pedido({ ...env, OLLAMA_URL: 'http://192.168.1.5:11435' })).toBeNull()
    expect(pedido({ ...env, OLLAMA_URL: 'no es una url' })).toBeNull()
  })

  it('sin nada en el .env, Cosxamix con el 3B: lo de por defecto desde la 9.0.0', () => {
    expect(pedido({})).toEqual({ puerto: '11435', modelo: MODELO })
    expect(pedido({ OLLAMA_URL: '' })).toEqual({ puerto: '11435', modelo: MODELO })
    expect(pedido({ OLLAMA_MODEL: 'qwen2.5-0.5b-instruct-q4_k_m' })?.modelo).toBe('qwen2.5-0.5b-instruct-q4_k_m')
    expect(pedido({ OLLAMA_URL: env.OLLAMA_URL })?.modelo).toBe(MODELO)
  })
})

describe('planear', () => {
  const r = rutas(ROOT)
  const todo = new Set([r.binario, join(r.modelos, `${MODELO}.gguf`), join(r.modelos, 'tokenizer.json')])

  it('con todo, arranca con el modelo que va a pedir la Session API', () => {
    const p = planear(env, ROOT, (x) => todo.has(x))
    expect(p.arrancar).toBe(true)
    expect(p.entorno).toEqual({ COSXAMIX_PORT: '11435', COSXAMIX_MODELOS: r.modelos, COSXAMIX_GGUF: `${MODELO}.gguf` })
  })

  it('sin binario, dice cómo bajarlo', () => {
    const p = planear(env, ROOT, (x) => todo.has(x) && x !== r.binario)
    expect(p).toEqual({ arrancar: false, motivo: expect.stringContaining('cosxamix:fetch') })
  })

  it('sin el modelo pedido NO arranca: sin modelo contestaría texto fijo', () => {
    const sinModelo = planear(env, ROOT, (x) => x === r.binario || x.endsWith('tokenizer.json'))
    expect(sinModelo).toEqual({ arrancar: false, motivo: expect.stringContaining('cosxamix:model') })
    // Con otro modelo bajado pero el .env pidiendo el 3B, tampoco.
    const otro = planear({ ...env, OLLAMA_MODEL: 'qwen2.5-0.5b-instruct-q4_k_m' }, ROOT, (x) => todo.has(x))
    expect(otro.arrancar).toBe(false)
  })

  it('sin tokenizador tampoco', () => {
    const p = planear(env, ROOT, (x) => todo.has(x) && !x.endsWith('tokenizer.json'))
    expect(p.arrancar).toBe(false)
  })

  it('apuntando a Ollama no hace nada', () => {
    expect(planear({ ...env, OLLAMA_URL: 'http://localhost:11434' }, ROOT, () => true).arrancar).toBe(false)
  })
})

describe('reintentar', () => {
  const min = 60_000
  it('hasta cinco caídas en diez minutos', () => {
    const ahora = 100 * min
    expect(reintentar([], ahora)).toBe(true)
    expect(reintentar([ahora - 1, ahora - 2, ahora - 3, ahora - 4], ahora)).toBe(true)
    expect(reintentar([ahora - 1, ahora - 2, ahora - 3, ahora - 4, ahora - 5], ahora)).toBe(false)
  })

  it('las viejas no cuentan', () => {
    const ahora = 100 * min
    const viejas = [1, 2, 3, 4, 5].map((i) => ahora - 11 * min - i)
    expect(reintentar(viejas, ahora)).toBe(true)
  })
})

describe('rutas', () => {
  it('el binario en bin/, lo demás en data/cosxamix/', () => {
    const w = rutas(ROOT, true)
    expect(w.binario).toBe(join(ROOT, 'bin', 'cosxamix.exe'))
    expect(rutas(ROOT, false).binario).toBe(join(ROOT, 'bin', 'cosxamix'))
    expect(w.modelos).toBe(join(ROOT, 'data', 'cosxamix', 'modelos'))
    expect(w.log).toBe(join(ROOT, 'data', 'cosxamix', 'cosxamix.log'))
  })
})
