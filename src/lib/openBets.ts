import { logger } from '@core/logger.js'
import { getUserData, patchUserData } from '@core/events.js'
import { enData, leerJson, guardarJson } from '@lib/jsonFile.js'

// Las apuestas de una mesa que vive en memoria (#bj, #poker).
//
// Esas mesas descuentan la apuesta AL REPARTIR —si se cobrara al final,
// alguien podría apostar, transferir su saldo y perder sin con qué pagar—. El
// costo de hacerlo así es el reinicio: la mano vive en memoria, y si el bot se
// reinicia a la mitad, lo descontado se perdería. Por eso cada mesa anota acá
// lo que tiene en juego, en data/<juego>.json, y al arrancar se DEVUELVE lo
// que quedó anotado.
//
// La devolución NO corre al importar: build_commands_manifest.js importa todos
// los comandos al compilar, y un `npm run build` con el bot andando vaciaría
// el archivo de las manos abiertas en ese momento. La llama el 'ready' de
// index.ts, una vez por proceso.

export class ApuestasAbiertas {
  private readonly archivo: string
  private devueltas = false

  constructor(private readonly juego: string) {
    this.archivo = enData(`${juego}.json`)
  }

  /** Anota lo que está en juego ahora: `sender → monto`. */
  anotar(abiertas: Iterable<[string, number]>): void {
    guardarJson(this.archivo, [...abiertas].map(([sender, apuesta]) => ({ sender, apuesta })))
  }

  /** Devuelve lo que quedó anotado por un reinicio. Una vez por proceso. */
  devolver(): void {
    if (this.devueltas) return
    this.devueltas = true
    const quedaron = leerJson<Array<{ sender: string; apuesta: number }>>(this.archivo, [], Array.isArray)
    if (!quedaron.length) return
    for (const { sender, apuesta } of quedaron) {
      if (typeof sender !== 'string' || !(apuesta > 0)) continue
      patchUserData(sender, { money: getUserData(sender).money + apuesta })
    }
    logger.info({ juego: this.juego, manos: quedaron.length }, 'devueltas las apuestas de manos interrumpidas')
    this.anotar([])
  }
}
