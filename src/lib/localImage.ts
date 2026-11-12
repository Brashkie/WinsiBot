// Crear una imagen en esta máquina, sin API: SD-Turbo en Cosxamix.
//
// `POST /api/image` de Cosxamix (src/image_gen.rs en su repositorio) genera en
// la CPU, en un paso: ~17 s por imagen en un i5-10400, y ~1 minuto más la
// primera vez, mientras carga el modelo. Si Cosxamix no tiene el modelo de
// imágenes —o no está corriendo— devuelve null y #imagine prueba lo siguiente.
//
// SD-Turbo aprendió en inglés: un prompt en español sale peor. Se traduce con
// la misma IA local (el Qwen de Cosxamix), no con Google: nada sale de la
// máquina. Si la traducción falla, va el texto como vino.

import { baseLocal as base, chatLocal } from './localChat.js'

/** La primera imagen carga ~2,6 GB: con un disco lento, más de un minuto. */
const TIEMPO_IMAGEN_MS = 240_000
const TIEMPO_TRADUCIR_MS = 30_000

/** El prompt en inglés, con la IA local; si no puede, el mismo. */
export async function aIngles(prompt: string, f: typeof fetch = fetch): Promise<string> {
  // Ya en inglés (ASCII y con palabras que solo son inglesas): no se toca. "a"
  // no cuenta: también es español ("un gato a la luna").
  if (/^[\x20-\x7e]*$/.test(prompt) && /\b(an|the|of|with|in|on|and)\b/i.test(prompt)) return prompt
  const r = await chatLocal(
    [
      {
        role: 'system',
        content: 'Translate the user text to English for an image generator. Reply with the translation only, no quotes, no explanations.',
      },
      { role: 'user', content: prompt },
    ],
    { temperature: 0, max_tokens: 120, timeoutMs: TIEMPO_TRADUCIR_MS },
    f,
  )
  const t = r?.replace(/^["']|["']$/g, '')
  return t && t.length < 600 ? t : prompt
}

export interface ImagenLocal {
  png: Buffer
  /** Lo que tardó en generarla (sin cargar el modelo), según Cosxamix. */
  ms: number
  semilla: string
}

/** La imagen, o null si Cosxamix no puede (sin modelo de imágenes, o apagado). */
export async function imagenLocal(prompt: string, f: typeof fetch = fetch): Promise<ImagenLocal | null> {
  try {
    const r = await f(`${base()}/api/image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIEMPO_IMAGEN_MS),
      body: JSON.stringify({ prompt }),
    })
    if (!r.ok || r.headers.get('content-type') !== 'image/png') return null
    return {
      png: Buffer.from(await r.arrayBuffer()),
      ms: Number(r.headers.get('x-cosxamix-ms') ?? 0),
      semilla: r.headers.get('x-cosxamix-seed') ?? '',
    }
  } catch {
    return null
  }
}
