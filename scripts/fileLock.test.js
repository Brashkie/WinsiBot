// El candado por archivo de la sesión (ver src/lib/fileLock.ts): de a uno, en
// orden de llegada, un error no traba la cola, y no queda nada guardado
// cuando nadie espera.
import { describe, expect, it } from 'vitest'
import { candadosActivos, conCandado } from '../src/lib/fileLock.ts'

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

describe('conCandado', () => {
  it('de a uno por archivo, en orden de llegada', async () => {
    const log = []
    let adentro = 0
    const tarea = (n, ms) => conCandado('creds', async () => {
      adentro++
      expect(adentro).toBe(1)
      log.push(`entra ${n}`)
      await esperar(ms)
      log.push(`sale ${n}`)
      adentro--
      return n
    })
    const r = await Promise.all([tarea(1, 20), tarea(2, 1), tarea(3, 5)])
    expect(r).toEqual([1, 2, 3])
    expect(log).toEqual(['entra 1', 'sale 1', 'entra 2', 'sale 2', 'entra 3', 'sale 3'])
  })

  it('archivos distintos no se esperan entre sí', async () => {
    const log = []
    await Promise.all([
      conCandado('a', async () => { await esperar(20); log.push('a') }),
      conCandado('b', async () => { log.push('b') }),
    ])
    expect(log).toEqual(['b', 'a'])
  })

  it('un error llega a quien llamó y no traba a los de atrás', async () => {
    const primero = conCandado('x', async () => { throw new Error('disco lleno') })
    const segundo = conCandado('x', async () => 'siguió')
    await expect(primero).rejects.toThrow('disco lleno')
    await expect(segundo).resolves.toBe('siguió')
  })

  it('sin nadie esperando no queda nada en memoria', async () => {
    await Promise.all(Array.from({ length: 500 }, (_, i) => conCandado(`pre-key-${i}`, async () => i)))
    await esperar(0)
    expect(candadosActivos()).toBe(0)
  })
})
