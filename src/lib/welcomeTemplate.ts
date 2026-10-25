// Las variables de la bienvenida y la despedida propias de un grupo. Lógica
// pura: se prueba desde scripts/stickers.test.js, con lo demás del lote.

/**
 * Las variables de un texto propio (#setwelcome / #setbye): @user (la
 * mención), @group (el nombre del grupo), @desc (su descripción) y @count
 * (cuántos son). Todas las veces que aparezcan: antes solo se cambiaba el
 * primer @user, y un texto que lo nombraba dos veces dejaba el segundo crudo.
 */
export function rellenar(texto: string, v: { num: string; grupo: string; desc: string; cuantos: number }): string {
  return texto
    .replaceAll('@user', `@${v.num}`)
    .replaceAll('@group', v.grupo)
    .replaceAll('@desc', v.desc)
    .replaceAll('@count', String(v.cuantos))
}
