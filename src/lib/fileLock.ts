// Un candado por archivo, para que dos escrituras del mismo archivo de sesión
// no se pisen. Reemplaza a `async-mutex`, que el bot usaba sin tenerlo en sus
// dependencias: llegaba de rebote con Baileys, y el día que Baileys lo soltara
// la sesión dejaba de guardarse sin que nada lo avisara antes.
//
// Además deja de acumular: antes había un Mutex por archivo para siempre, y la
// sesión de WhatsApp son cientos o miles de archivos de claves. Acá la entrada
// de un archivo vive mientras alguien la espera, y se borra con el último.
//
// Lógica pura, sin alias: se prueba desde scripts/fileLock.test.js.

interface Turno {
  cola: Promise<void>
  pendientes: number
}

const turnos = new Map<string, Turno>()

/**
 * Corre `fn` cuando nadie más tiene el candado de `clave`, en orden de
 * llegada. Lo que `fn` devuelva o lance llega tal cual a quien llama, y el
 * candado se suelta igual.
 */
export function conCandado<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  let t = turnos.get(clave)
  if (!t) {
    t = { cola: Promise.resolve(), pendientes: 0 }
    turnos.set(clave, t)
  }
  t.pendientes++
  const turno = t
  const resultado = turno.cola.then(fn)
  // La cola sigue cuando este termina, haya salido bien o mal.
  turno.cola = resultado.then(
    () => undefined,
    () => undefined,
  )
  void turno.cola.then(() => {
    if (--turno.pendientes === 0 && turnos.get(clave) === turno) turnos.delete(clave)
  })
  return resultado
}

/** Cuántos archivos tienen a alguien esperando o escribiendo. Para los tests. */
export const candadosActivos = () => turnos.size
