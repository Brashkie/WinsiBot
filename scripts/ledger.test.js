// Mover saldos, del lado del bot (src/lib/ledger.ts): leer, preguntar a la
// Session API y escribir solo si nada cambió en el medio.
import { describe, expect, it } from 'vitest'
import { mover } from '../src/lib/ledger.ts'

// La misma regla que la Session API (y que Ada), para probar el bot sin red.
const MAX = 2 ** 53 - 1
function regla({ origen, destino, monto, misma }) {
  if (origen < 0 || origen > MAX || destino < 0 || destino > MAX) return { codigo: 5, origen, destino }
  if (misma) return { codigo: 4, origen, destino }
  if (monto < 1) return { codigo: 1, origen, destino }
  if (monto > origen) return { codigo: 2, origen, destino }
  if (destino > MAX - monto) return { codigo: 3, origen, destino }
  return { codigo: 0, origen: origen - monto, destino: destino + monto }
}

function banco(saldos, decidir = async (p) => regla(p)) {
  const k = (c) => `${c.jid}/${c.campo}`
  return {
    saldos,
    deps: { leer: (c) => saldos[k(c)] ?? 0, escribir: (c, v) => { saldos[k(c)] = v }, decidir },
  }
}

const A = { jid: 'a', campo: 'money' }
const B = { jid: 'b', campo: 'money' }

describe('mover', () => {
  it('mueve y conserva el total', async () => {
    const { saldos, deps } = banco({ 'a/money': 1000, 'b/money': 50 })
    const r = await mover({ origen: A, destino: B, monto: 300 }, deps)
    expect(r).toEqual({ ok: true, motivo: 'hecho', origen: 700, destino: 350 })
    expect(saldos).toEqual({ 'a/money': 700, 'b/money': 350 })
  })

  it('del bolsillo al banco del mismo usuario no es "la misma cuenta"', async () => {
    const { saldos, deps } = banco({ 'a/money': 100, 'a/bank': 0 })
    const r = await mover({ origen: A, destino: { jid: 'a', campo: 'bank' }, monto: 100 }, deps)
    expect(r.ok).toBe(true)
    expect(saldos).toEqual({ 'a/money': 0, 'a/bank': 100 })
  })

  it('si no se puede, no se toca nada', async () => {
    const { saldos, deps } = banco({ 'a/money': 10, 'b/money': 0 })
    expect((await mover({ origen: A, destino: B, monto: 11 }, deps)).motivo).toBe('sin_saldo')
    expect((await mover({ origen: A, destino: A, monto: 1 }, deps)).motivo).toBe('misma_cuenta')
    expect(saldos).toEqual({ 'a/money': 10, 'b/money': 0 })
  })

  it('dos #pay a la vez del mismo saldo: solo uno se aplica', async () => {
    const { saldos, deps } = banco({ 'a/money': 100, 'b/money': 0, 'c/money': 0 })
    const C = { jid: 'c', campo: 'money' }
    // Los dos leen 100 antes de que llegue la primera respuesta.
    const [r1, r2] = await Promise.all([
      mover({ origen: A, destino: B, monto: 100 }, deps),
      mover({ origen: A, destino: C, monto: 100 }, deps),
    ])
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1)
    expect(r1.ok ? r2.motivo : r1.motivo).toBe('cambio')
    expect(saldos['a/money'] + saldos['b/money'] + saldos['c/money']).toBe(100)
    expect(saldos['a/money']).toBe(0)
  })

  it('sin la Session API, no se mueve nada', async () => {
    const { saldos, deps } = banco({ 'a/money': 100, 'b/money': 0 }, async () => null)
    expect(await mover({ origen: A, destino: B, monto: 5 }, deps)).toEqual({ ok: false, motivo: 'sin_api', origen: 100, destino: 0 })
    const caida = banco({ 'a/money': 100, 'b/money': 0 }, async () => { throw new Error('ECONNREFUSED') })
    expect((await mover({ origen: A, destino: B, monto: 5 }, caida.deps)).motivo).toBe('sin_api')
    expect(saldos['a/money']).toBe(100)
  })
})

// ── aplicar: ganar, gastar, varias cosas juntas ──────────────────────────────
import { aplicar } from '../src/lib/ledger.ts'

// La misma regla que Ledger.Aplicar_C.
function reglaAplicar({ saldos, cambios }) {
  if (saldos.length > 8 || saldos.length !== cambios.length) return { codigo: 5, saldos }
  if (saldos.some((s) => s < 0 || s > MAX) || cambios.some((c) => Math.abs(c) > MAX)) return { codigo: 5, saldos }
  for (let i = 0; i < saldos.length; i++) {
    if (saldos[i] + cambios[i] < 0) return { codigo: 2, saldos }
    if (saldos[i] + cambios[i] > MAX) return { codigo: 3, saldos }
  }
  return { codigo: 0, saldos: saldos.map((s, i) => s + cambios[i]) }
}
const conAplicar = (saldos) => {
  const b = banco(saldos)
  b.deps.aplicar = async (p) => reglaAplicar(p)
  return b
}

describe('aplicar', () => {
  it('un cofre: dinero y diamantes juntos', async () => {
    const { saldos, deps } = conAplicar({ 'a/money': 100, 'a/diamonds': 3 })
    const r = await aplicar([{ cuenta: A, delta: 250 }, { cuenta: { jid: 'a', campo: 'diamonds' }, delta: 2 }], deps)
    expect(r).toEqual({ ok: true, motivo: 'hecho', saldos: [350, 5] })
    expect(saldos).toEqual({ 'a/money': 350, 'a/diamonds': 5 })
  })

  it('todo o nada: si un saldo no alcanza, no se toca ninguno', async () => {
    const { saldos, deps } = conAplicar({ 'a/money': 100, 'a/diamonds': 1 })
    const r = await aplicar([{ cuenta: A, delta: -50 }, { cuenta: { jid: 'a', campo: 'diamonds' }, delta: -2 }], deps)
    expect(r.motivo).toBe('sin_saldo')
    expect(saldos).toEqual({ 'a/money': 100, 'a/diamonds': 1 })
  })

  it('dos cambios a la misma cuenta se suman antes de preguntar', async () => {
    const { saldos, deps } = conAplicar({ 'a/money': 10 })
    let pedido
    const decide = deps.aplicar
    deps.aplicar = async (p) => { pedido = p; return decide(p) }
    const r = await aplicar([{ cuenta: A, delta: -15 }, { cuenta: A, delta: 20 }], deps)
    expect(pedido).toEqual({ saldos: [10], cambios: [5] })
    expect(r.ok).toBe(true)
    expect(saldos['a/money']).toBe(15)
  })

  it('dos gastos a la vez del mismo saldo: solo uno se aplica', async () => {
    const { saldos, deps } = conAplicar({ 'a/money': 100 })
    const [r1, r2] = await Promise.all([aplicar([{ cuenta: A, delta: -100 }], deps), aplicar([{ cuenta: A, delta: -100 }], deps)])
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1)
    expect(saldos['a/money']).toBe(0)
  })

  it('sin la Session API, ni sin la ruta, no se cambia nada', async () => {
    const { saldos, deps } = banco({ 'a/money': 100 })
    expect((await aplicar([{ cuenta: A, delta: 5 }], deps)).motivo).toBe('sin_api')
    deps.aplicar = async () => null
    expect((await aplicar([{ cuenta: A, delta: 5 }], deps)).motivo).toBe('sin_api')
    expect(saldos['a/money']).toBe(100)
  })
})

// ── sumarAcotado: la XP de cada mensaje, con el mismo tope, en local ─────────
import { MAX_SALDO, sumarAcotado } from '../src/lib/ledger.ts'

describe('sumarAcotado', () => {
  it('suma, y se planta en el máximo en vez de perder exactitud', () => {
    expect(sumarAcotado(10, 5)).toBe(15)
    expect(sumarAcotado(MAX_SALDO - 2, 5)).toBe(MAX_SALDO)
    expect(sumarAcotado(MAX_SALDO, 1)).toBe(MAX_SALDO)
  })
  it('no resta ni acepta basura', () => {
    expect(sumarAcotado(10, -5)).toBe(10)
    expect(sumarAcotado(10, 1.5)).toBe(10)
    expect(sumarAcotado(Number.NaN, 3)).toBe(3)
    expect(sumarAcotado(-4, 3)).toBe(3)
  })
})
