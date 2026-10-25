// Traducir con Google, con el fetch de Node.
//
// Reemplaza a @vitalets/google-translate-api, que para lo mismo cargaba ~1,9 MB
// de heap y sus propias dependencias. Se usa el endpoint `gtx` (el de las
// extensiones del navegador): sin clave, una petición, y la respuesta es un
// arreglo con la traducción en pedazos. Va por POST para que un texto largo no
// choque con el tope del largo de una URL.

const URL_GTX = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'

export interface Traduccion { text: string; from: string }

export async function translate(texto: string, opts: { to: string; from?: string }): Promise<Traduccion> {
  const res = await fetch(`${URL_GTX}&sl=${encodeURIComponent(opts.from ?? 'auto')}&tl=${encodeURIComponent(opts.to)}`, {
    method:  'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body:    new URLSearchParams({ q: texto }),
    signal:  AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw Object.assign(new Error(`traductor: HTTP ${res.status}`), { status: res.status })
  // [[["hola","hello",…], …], null, "en", …]
  const data = await res.json() as [Array<[string, ...unknown[]]> | null, unknown, string?]
  const text = (data[0] ?? []).map(pedazo => pedazo[0] ?? '').join('')
  if (!text) throw new Error('traductor: respuesta vacía')
  return { text, from: typeof data[2] === 'string' ? data[2] : opts.from ?? 'auto' }
}
