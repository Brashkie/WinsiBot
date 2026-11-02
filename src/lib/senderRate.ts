// El rate limit de cada mensaje: 15 por remitente cada 10 s, en memoria.
//
// Hasta la 9.2 era un viaje a la Session API (/rate/check) que se esperaba en
// CADA mensaje con texto, antes de todo lo demás. Medido desde el bot, con el
// mismo cliente, contra una Session API aislada: ~157 µs de espera y ~140-175
// µs de CPU de Node por mensaje, más la de Rust, para sumar uno a un contador.
// En memoria es menos de 1 µs. Es la misma regla que rate_limiter.rs —ventana
// fija—, así que el bot se porta igual.
//
// Sin alias de importación, para poder probarlo.

export const LIMITE = 15
export const VENTANA_MS = 10_000

interface Ventana {
  desde: number
  n: number
}

export class LimitePorRemitente {
  private readonly ventanas = new Map<string, Ventana>()
  private llamadas = 0

  constructor(
    private readonly limite = LIMITE,
    private readonly ventanaMs = VENTANA_MS,
  ) {}

  /** true si el mensaje pasa; cuenta el mensaje. */
  permitir(remitente: string, ahora = Date.now()): boolean {
    // Cada tanto se tiran las ventanas vencidas: así el mapa no crece con
    // cada remitente que alguna vez escribió.
    if (++this.llamadas % 1024 === 0) this.limpiar(ahora)
    let v = this.ventanas.get(remitente)
    if (!v || ahora - v.desde > this.ventanaMs) {
      v = { desde: ahora, n: 0 }
      this.ventanas.set(remitente, v)
    }
    v.n++
    return v.n <= this.limite
  }

  limpiar(ahora = Date.now()): void {
    for (const [k, v] of this.ventanas) if (ahora - v.desde > this.ventanaMs) this.ventanas.delete(k)
  }

  get tamano(): number {
    return this.ventanas.size
  }
}
