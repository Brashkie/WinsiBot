// Un solo temporizador, armado para lo próximo que vence.
//
// Recordatorios, subastas y el jefe de mundo guardan cosas que vencen en un
// momento dado, y los tres hacen lo mismo: en vez de revisar la lista cada
// minuto, se arma UN temporizador para la primera, y al vencer se vuelve a
// armar. Antes cada uno tenía su copia de esto.

/** setTimeout no acepta más de 2^31-1 ms (~24,8 días): uno más lejano se
 *  arma hasta ahí y, al despertar, quien llama vuelve a calcular. */
const MAX_ESPERA = 2_147_483_647

export class Despertador {
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly alDespertar: () => void | Promise<void>) {}

  /** Arma para `cuando` (ms); `null` o `Infinity` desarma. */
  armar(cuando: number | null): void {
    this.desarmar()
    if (cuando === null || !Number.isFinite(cuando)) return
    const espera = Math.min(Math.max(cuando - Date.now(), 0), MAX_ESPERA)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.alDespertar()
    }, espera)
    // No mantiene vivo el proceso: el apagado no espera a algo de la semana que viene.
    this.timer.unref()
  }

  desarmar(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
