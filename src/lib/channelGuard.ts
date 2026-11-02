// La parte pura de la protección de canales: leer lo que cambió y decidir qué
// restaurar. Lo que habla con WhatsApp está en core/events/channelGuard.ts.
//
// WhatsApp avisa cuando cambian el nombre o la descripción de un canal, pero
// no dice quién lo hizo. Así que no hay a quién degradar: se guarda cómo
// estaba, se restaura si cambia y se avisa. Un cambio que el dueño sí quiere
// se confirma con `#canal actualizar`.
//
// Sin alias de importación, para poder probarlo.

export interface CanalGuardado {
  nombre: string
  descripcion: string
}

/**
 * Baileys manda el cambio de dos formas: `{ name: 'texto' }` por un camino y,
 * por el otro, lo que traiga el servidor (visto como `{ name: { text } }`).
 * Se aceptan las dos; lo que no se entiende se ignora.
 */
export function leerCambio(update: unknown): Partial<CanalGuardado> {
  const u = (update ?? {}) as Record<string, unknown>
  const texto = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string') {
      return (v as { text: string }).text
    }
    return undefined
  }
  const nombre = texto(u.name)
  const descripcion = texto(u.description)
  return {
    ...(nombre !== undefined ? { nombre } : {}),
    ...(descripcion !== undefined ? { descripcion } : {}),
  }
}

/**
 * Qué volver atrás: solo lo que cambió y es distinto de lo guardado. Cuando el
 * bot restaura, WhatsApp manda el aviso de su propio cambio, con lo guardado:
 * ahí no hay nada que hacer, y por eso no entra en un bucle.
 */
export function aRestaurar(guardado: CanalGuardado, cambio: Partial<CanalGuardado>): Partial<CanalGuardado> | null {
  const out: Partial<CanalGuardado> = {}
  if (cambio.nombre !== undefined && cambio.nombre !== guardado.nombre) out.nombre = guardado.nombre
  if (cambio.descripcion !== undefined && cambio.descripcion !== guardado.descripcion) {
    out.descripcion = guardado.descripcion
  }
  return Object.keys(out).length ? out : null
}

/** El jid del canal a partir de lo que escribió el dueño, o el código del link. */
export function leerCanal(arg: string): { jid: string } | { codigo: string } | null {
  const a = arg.trim()
  if (/^\d+@newsletter$/.test(a)) return { jid: a }
  const m = /whatsapp\.com\/channel\/([A-Za-z0-9]+)/.exec(a)
  return m ? { codigo: m[1]! } : null
}
