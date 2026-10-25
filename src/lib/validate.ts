// Validar el cuerpo de las rutas del panel sin zod: son uno o dos campos por
// ruta, y zod se cargaba entero (~1,9 MB) para eso.

/** `v` si es un string de `min` a `max` caracteres; si no, null. */
export function textoEntre(v: unknown, min: number, max: number): string | null {
  return typeof v === 'string' && v.length >= min && v.length <= max ? v : null
}

/** El cuerpo como objeto, o un objeto vacío si no lo es (JSON roto, un array…). */
export const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
