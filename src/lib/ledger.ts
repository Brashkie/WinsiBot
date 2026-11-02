// Mover un monto de un saldo a otro, del lado del bot: #pay, #transfer y el
// banco. La regla —cuánto queda en cada lado, o por qué no se puede— la
// decide la Session API con la función de Ada/SPARK cuyas garantías
// demuestra GNATprove (crates/session-api/ada/src/ledger.ads). Acá solo se lee,
// se pregunta y se escribe.
//
// Entre leer los saldos y escribirlos hay una espera —el viaje a la Session
// API—, y en esa espera puede entrar otro #pay del mismo usuario: los dos
// leerían el mismo saldo y gastarían dos veces. Por eso, antes de escribir, se
// vuelve a leer: si algún saldo cambió, no se aplica nada.
//
// Si la Session API no responde, no se mueve nada: con plata, el lado seguro
// es rechazar.
//
// Sin alias de importación, para poder probarlo: lo que habla con los datos
// del bot y con la red entra por `Deps` (ver core/economy.ts).

export type Campo = 'money' | 'bank' | 'diamonds' | 'exp'

export interface Cuenta {
  jid: string
  campo: Campo
}

export interface Pedido {
  origen: Cuenta
  destino: Cuenta
  monto: number
}

/** Lo que devuelve la Session API, en el orden del `Resultado` de Ada. */
export type Motivo =
  | 'hecho'
  | 'monto_invalido'
  | 'sin_saldo'
  | 'desborda'
  | 'misma_cuenta'
  | 'fuera_de_rango'
  | 'sin_api'
  | 'cambio'

const MOTIVOS: Motivo[] = ['hecho', 'monto_invalido', 'sin_saldo', 'desborda', 'misma_cuenta', 'fuera_de_rango']

export interface Resultado {
  ok: boolean
  motivo: Motivo
  /** Los saldos después: los nuevos si se hizo, los de antes si no. */
  origen: number
  destino: number
}

export interface Deps {
  leer(c: Cuenta): number
  escribir(c: Cuenta, valor: number): void
  decidir(pedido: {
    origen: number
    destino: number
    monto: number
    misma: boolean
  }): Promise<{ codigo: number; origen: number; destino: number } | null>
  /** /economy/apply: todo o nada, decidido por Ada/SPARK. */
  aplicar?(pedido: { saldos: number[]; cambios: number[] }): Promise<{ codigo: number; saldos: number[] } | null>
}

export async function mover(p: Pedido, d: Deps): Promise<Resultado> {
  const antes = { origen: d.leer(p.origen), destino: d.leer(p.destino) }
  const misma = p.origen.jid === p.destino.jid && p.origen.campo === p.destino.campo
  const r = await d.decidir({ ...antes, monto: p.monto, misma }).catch(() => null)
  if (!r) return { ok: false, motivo: 'sin_api', ...antes }

  const motivo = MOTIVOS[r.codigo] ?? 'fuera_de_rango'
  if (motivo !== 'hecho') return { ok: false, motivo, ...antes }

  // Mientras se esperaba la respuesta pudo entrar otro movimiento de las
  // mismas cuentas: si algo cambió, no se escribe encima.
  if (d.leer(p.origen) !== antes.origen || d.leer(p.destino) !== antes.destino) {
    return { ok: false, motivo: 'cambio', origen: d.leer(p.origen), destino: d.leer(p.destino) }
  }
  d.escribir(p.origen, r.origen)
  d.escribir(p.destino, r.destino)
  return { ok: true, motivo: 'hecho', origen: r.origen, destino: r.destino }
}

export interface Cambio {
  cuenta: Cuenta
  /** Cuánto suma (positivo) o resta (negativo). */
  delta: number
}

export interface ResultadoAplicar {
  ok: boolean
  motivo: Motivo
  /** El saldo de cada cuenta después, en el orden en que se pidieron. */
  saldos: number[]
}

/** El último entero exacto de JavaScript: el Max_Saldo de Ada. */
export const MAX_SALDO = Number.MAX_SAFE_INTEGER

/**
 * Sumar una ganancia sin pasar del máximo, para lo que corre en CADA mensaje
 * (la XP por mensaje), donde un viaje a la Session API costaría más que todo
 * el mensaje (ver handler.ts). El mismo tope que Ada, pero se satura en vez
 * de rechazar: es una ganancia, no un movimiento entre cuentas.
 */
export function sumarAcotado(saldo: number, ganancia: number): number {
  if (!Number.isSafeInteger(saldo) || saldo < 0) saldo = 0
  if (!Number.isSafeInteger(ganancia) || ganancia <= 0) return saldo
  return ganancia > MAX_SALDO - saldo ? MAX_SALDO : saldo + ganancia
}

/** Cuántas cuentas distintas puede tocar una operación (Max_Cuentas en Ada). */
export const MAX_CUENTAS = 8

const clave = (c: Cuenta) => `${c.jid}\u0000${c.campo}`

/**
 * Ganar, gastar, o varias cosas juntas —un cofre da dinero y diamantes—:
 * todo o nada, decidido por Ada/SPARK (Ledger.Aplicar_C). Dos cambios a la
 * misma cuenta se suman antes de preguntar. Igual que `mover`: se vuelve a
 * leer antes de escribir, y si algo cambió en la espera no se aplica nada.
 */
export async function aplicar(cambios: readonly Cambio[], d: Deps): Promise<ResultadoAplicar> {
  const cuentas: Cuenta[] = []
  const deltas = new Map<string, number>()
  for (const c of cambios) {
    const k = clave(c.cuenta)
    if (!deltas.has(k)) cuentas.push(c.cuenta)
    deltas.set(k, (deltas.get(k) ?? 0) + c.delta)
  }
  const antes = cuentas.map((c) => d.leer(c))
  const saldosDe = () => cambios.map((c) => d.leer(c.cuenta))
  if (!d.aplicar) return { ok: false, motivo: 'sin_api', saldos: saldosDe() }
  if (cuentas.length > MAX_CUENTAS) return { ok: false, motivo: 'fuera_de_rango', saldos: saldosDe() }

  const r = await d
    .aplicar({ saldos: antes, cambios: cuentas.map((c) => deltas.get(clave(c))!) })
    .catch(() => null)
  if (!r) return { ok: false, motivo: 'sin_api', saldos: saldosDe() }
  const motivo = MOTIVOS[r.codigo] ?? 'fuera_de_rango'
  if (motivo !== 'hecho') return { ok: false, motivo, saldos: saldosDe() }

  if (cuentas.some((c, i) => d.leer(c) !== antes[i])) return { ok: false, motivo: 'cambio', saldos: saldosDe() }
  cuentas.forEach((c, i) => {
    d.escribir(c, r.saldos[i]!)
  })
  return { ok: true, motivo: 'hecho', saldos: saldosDe() }
}

/** Lo que se le dice al usuario cuando no se pudo. */
export function textoDeMotivo(m: Motivo): string {
  switch (m) {
    case 'sin_saldo':
      return 'No tienes suficiente.'
    case 'monto_invalido':
      return 'Ingresa una cantidad válida.'
    case 'desborda':
      return 'Esa cuenta no puede recibir tanto.'
    case 'misma_cuenta':
      return 'No puedes moverlo a la misma cuenta.'
    case 'cambio':
      return 'Tu saldo cambió mientras se hacía: inténtalo de nuevo.'
    case 'sin_api':
      return 'No se pudo hacer ahora, no se movió nada: inténtalo en un momento.'
    default:
      return 'No se pudo hacer.'
  }
}
