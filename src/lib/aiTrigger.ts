// ¿Le hablan al bot por su nombre?
//
// Hasta la 9.3.0 bastaba con que el nombre apareciera EN CUALQUIER PARTE del
// texto (`includes`). Otro bot del grupo que contestaba «《✧》 El comando
// *hepein* no existe» disparaba la IA, WinsiBot le respondía, y podía armarse
// una charla entre los dos bots.
//
// Ahora el nombre tiene que estar como palabra suelta: "hepein, qué hora es",
// "oye hepein", "¿sos tóxico hepein?". No cuenta dentro de otra palabra
// ("hepeinazo"), ni con el formato con que un bot cita un comando: "*hepein*",
// "_hepein_", "`hepein`", "~hepein~" o "#hepein".
//
// Lógica pura: se prueba desde scripts/aiTrigger.test.js.

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const cache = new Map<string, RegExp>()

function patron(nombre: string): RegExp {
  let re = cache.get(nombre)
  if (!re) {
    // Antes: inicio, o algo que no sea letra, número ni marca de formato.
    // Después: fin, o lo mismo. Con `u`, \p{L} cubre tildes y eñes.
    const borde = String.raw`[^\p{L}\p{N}*_\x60~#]`
    re = new RegExp(`(?:^|${borde})${escapar(nombre)}(?=$|${borde})`, 'iu')
    cache.set(nombre, re)
  }
  return re
}

/** Si `texto` nombra al bot con alguno de `nombres` (sin distinguir mayúsculas). */
export function nombraAlBot(texto: string, nombres: readonly string[]): boolean {
  return nombres.some((n) => n.length > 0 && patron(n.toLowerCase()).test(texto))
}
