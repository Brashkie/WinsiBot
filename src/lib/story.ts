// El teléfono descompuesto (#historia): las reglas, sin estado ni WhatsApp.
// La usa el comando y se prueba desde scripts/story.test.js.
//
// En un grupo todos ven todos los mensajes: si cada uno escribiera su parte
// ahí, el siguiente leería la historia entera y el teléfono no se
// descompondría nunca. Por eso se juega por PRIVADO: a quien le toca se le
// muestra SOLO el último fragmento. Después de cada jugador, la IA agrega un
// giro mirando también solo ese fragmento, y el siguiente ve solo el giro.
// Al final se revela todo junto en el grupo.

export const MIN_JUGADORES = 3
export const MAX_JUGADORES = 10
export const MAX_CARACTERES = 200

export interface Fragmento {
  autor: string | null   // null = la IA
  texto: string
}

/** Cuántos turnos humanos: dos vueltas con pocos jugadores, una con muchos. */
export const turnosTotales = (jugadores: number) => (jugadores <= 4 ? jugadores * 2 : jugadores)

/** A quién le toca en el turno `t` (desde 0): en orden de llegada, en vueltas. */
export const turnoDe = <T>(orden: T[], t: number): T => orden[t % orden.length]!

/** Lo que ve el que sigue: el ÚLTIMO fragmento, y nada más. */
export function loQueVe(fragmentos: Fragmento[]): string {
  return fragmentos.at(-1)?.texto ?? ''
}

/** El texto de un jugador, limpio y con tope. */
export function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAX_CARACTERES)
}

/** La historia entera para revelar, con quién escribió cada parte. */
export function relato(fragmentos: Fragmento[], nombre: (autor: string) => string): string {
  return fragmentos
    .map(f => (f.autor === null ? `🤖 _${f.texto}_` : `✍️ *${nombre(f.autor)}:* ${f.texto}`))
    .join('\n')
}

/** Solo el texto, para pedirle el título a la IA. */
export const textoPlano = (fragmentos: Fragmento[]) => fragmentos.map(f => f.texto).join(' ')
