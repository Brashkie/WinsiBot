import { logger } from '@core/logger.js'
import { cambiarSaldos } from '@core/economy.js'
import { enData, leerJson, guardarJson } from '@lib/jsonFile.js'

// Las apuestas de una mesa que vive en memoria (#bj, #poker, #arena).
//
// Esas mesas descuentan la apuesta AL REPARTIR —si se cobrara al final,
// alguien podría apostar, transferir su saldo y perder sin con qué pagar—. El
// costo de hacerlo así es el reinicio: la mano vive en memoria, y si el bot se
// reinicia a la mitad, lo descontado se perdería. Por eso cada mesa anota acá
// lo que tiene en juego, en data/<juego>.json, y al arrancar se DEVUELVE lo
// que quedó anotado.
//
// Desde la 9.3 los saldos se cambian por la operación de Ada/SPARK de la
// Session API (ver core/economy.ts), y un pago puede fallar si la API no
// responde. Un pago que falla no se pierde: queda anotado en el mismo archivo
// y se paga en el próximo arranque. Y al devolver, solo se borra lo que de
// verdad se devolvió.
//
// La devolución NO corre al importar: build_commands_manifest.js importa todos
// los comandos al compilar, y un `npm run build` con el bot andando vaciaría
// el archivo de las manos abiertas en ese momento. La llama el 'ready' de
// index.ts, una vez por proceso.

export class ApuestasAbiertas {
  private readonly archivo: string
  private devueltas = false
  /** Lo que está en juego en las manos abiertas: `sender → monto`. */
  private enJuego: Array<[string, number]> = []
  /** Pagos que fallaron: se pagan en el próximo arranque. */
  private readonly porPagar = new Map<string, number>()

  constructor(private readonly juego: string) {
    this.archivo = enData(`${juego}.json`)
  }

  /** Anota lo que está en juego ahora: `sender → monto`. */
  anotar(abiertas: Iterable<[string, number]>): void {
    this.enJuego = [...abiertas]
    this.guardar()
  }

  /**
   * Le acredita `monto` a `sender` (un premio, o una apuesta que se devuelve).
   * Si no se puede, queda anotado para el próximo arranque. true si se pagó ya.
   */
  async pagar(sender: string, monto: number): Promise<boolean> {
    if (!(monto > 0)) return true
    const r = await cambiarSaldos([{ cuenta: { jid: sender, campo: 'money' }, delta: monto }])
    if (r.ok) return true
    this.porPagar.set(sender, (this.porPagar.get(sender) ?? 0) + monto)
    this.guardar()
    logger.warn({ juego: this.juego, sender, monto, motivo: r.motivo }, 'pago anotado para el próximo arranque')
    return false
  }

  private guardar(): void {
    const filas = [...this.enJuego, ...this.porPagar]
    guardarJson(this.archivo, filas.map(([sender, apuesta]) => ({ sender, apuesta })))
  }

  /** Devuelve lo que quedó anotado: manos interrumpidas y pagos pendientes. Una vez por proceso. */
  async devolver(): Promise<void> {
    if (this.devueltas) return
    this.devueltas = true
    const quedaron = leerJson<Array<{ sender: string; apuesta: number }>>(this.archivo, [], Array.isArray)
    if (!quedaron.length) return
    let devueltas = 0
    for (const { sender, apuesta } of quedaron) {
      if (typeof sender !== 'string' || !(apuesta > 0)) continue
      // pagar() anota lo que no pudo; lo que sí, ya no vuelve al archivo.
      if (await this.pagar(sender, apuesta)) devueltas++
    }
    this.guardar()
    logger.info({ juego: this.juego, manos: quedaron.length, devueltas }, 'devueltas las apuestas de manos interrumpidas')
  }
}
