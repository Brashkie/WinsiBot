// Cuánto silencio de mensajes es raro, según el ritmo del propio bot.
//
// El watchdog de conexión zombie (core/socket.ts) reconectaba tras 10 minutos
// sin ningún mensaje entrante. Se pensó con 400+ grupos activos, donde tanto
// silencio solo pasa con la conexión colgada. Con pocos grupos tranquilos —4
// en la cuenta de prueba— 10 minutos sin mensajes es lo normal, y el bot se
// reconectaba cada ~11 minutos todo el día, repitiendo el backlog cada vez.
//
// Ahora el límite sale del ritmo medido: 3 veces el percentil 90 de los
// silencios entre mensajes nuevos, entre 10 minutos (lo de siempre: un bot
// con tráfico sigue igual) y 3 horas. Sin datos suficientes —menos de 8
// silencios medidos—, 3 horas: un bot con tráfico los junta en minutos, y uno
// sin tráfico no da motivo para sospechar antes.
//
// Se anota como mucho un mensaje por minuto: una ráfaga, o el backlog al
// reconectar, no cuentan como "el grupo habla cada segundo".

export const LIMITE_MIN_MS = 10 * 60_000
export const LIMITE_MAX_MS = 3 * 60 * 60_000
const VENTANA = 64
const SILENCIOS_MIN = 8
const AGRUPAR_MS = 60_000

export class RitmoMensajes {
  private marcas: number[] = []

  /** Un mensaje nuevo entró en `ahora` (ms). */
  anotar(ahora: number): void {
    const ultima = this.marcas.at(-1)
    if (ultima !== undefined && ahora - ultima < AGRUPAR_MS) return
    this.marcas.push(ahora)
    if (this.marcas.length > VENTANA) this.marcas.shift()
  }

  /** Cuánto silencio, en ms, ya es sospechoso. */
  limite(): number {
    if (this.marcas.length - 1 < SILENCIOS_MIN) return LIMITE_MAX_MS
    const silencios = this.marcas.slice(1).map((t, i) => t - this.marcas[i]!).sort((a, b) => a - b)
    const p90 = silencios[Math.min(silencios.length - 1, Math.floor(silencios.length * 0.9))]!
    return Math.min(LIMITE_MAX_MS, Math.max(LIMITE_MIN_MS, 3 * p90))
  }
}
