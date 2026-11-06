// Imágenes en la Session API (9.4.0): un sticker, también animado
// (sticker.rs y animation.rs), un SVG a imagen y convertir o redimensionar una
// (render.rs), y los cuadros de una animación para #toimg. Todo lo que el bot
// le pedía a sharp pasa por acá.
//
// sharp ya no está: si la Session API no responde, la imagen no se puede
// hacer y se lanza ImagenError —el comando avisa—, como pasa con la economía
// o la IA. La API es parte del bot, no un extra.

// rustHttp y el logger se cargan al usarse, no arriba: los dos traen alias
// (`@config`) que los tests de vitest no resuelven, y así los tests le ponen
// un rustHttp falso.

export type Formato = 'png' | 'jpeg' | 'webp'

export interface Tamano {
  ancho: number
  alto: number
  /** inside: entra entera, sin agrandar (por defecto). cover: cubre todo, recortando al centro. */
  ajuste?: 'inside' | 'cover'
}

/** La Session API no pudo hacer la imagen: no responde, o no es una imagen que lea. */
export class ImagenError extends Error {
  constructor(
    readonly ruta: string,
    /** 422: la imagen no se pudo leer. Sin código: la API no respondió. */
    readonly status?: number,
    causa?: string,
  ) {
    super(`la Session API no pudo hacer la imagen (${ruta}${status ? `, HTTP ${status}` : ''}${causa ? `: ${causa}` : ''})`)
    this.name = 'ImagenError'
  }
}

/** La imagen que devuelve la Session API. Lanza ImagenError si no la hizo. */
async function pedir(ruta: string, cuerpo: Buffer, params: Record<string, string | number | undefined>): Promise<Buffer> {
  let error: any
  try {
    const { rustHttp } = await import('./rustHttp.js')
    const r = await rustHttp.post<Buffer>(ruta, cuerpo, { params, timeout: 20_000 })
    if (Buffer.isBuffer(r.data)) return r.data
  } catch (err: any) {
    error = err
  }
  const status = error?.response?.status
  import('../core/logger.js')
    .then(({ logger }) => logger.warn({ err: error?.message, status, ruta }, '[imagen] la Session API no la hizo'))
    .catch(() => {})
  throw new ImagenError(ruta, status, typeof error?.response?.data === 'string' ? error.response.data : error?.message)
}

/** Un sticker: PNG, JPEG o WebP → WebP de 512; un GIF o WebP animado → WebP animado. */
export function stickerEnRust(media: Buffer, calidad: number, completo: boolean): Promise<Buffer> {
  return pedir('/image/sticker', media, { calidad, completo: completo ? 1 : 0 })
}

/**
 * Los cuadros de un GIF o WebP animado como MJPEG (JPEG seguidos) a `fps`
 * fijos y sobre blanco, para pasarlos a MP4 con ffmpeg (#toimg): ffmpeg no
 * lee bien el WebP animado.
 */
export function animacionAMjpeg(animacion: Buffer, fps = 15): Promise<Buffer> {
  return pedir('/image/mjpeg', animacion, { fps })
}

/** Un SVG a imagen. */
export function svgAImagen(svg: string, formato: Formato = 'png', calidad = 88): Promise<Buffer> {
  return pedir('/image/svg', Buffer.from(svg), { formato, calidad })
}

/** Una imagen (PNG, JPEG o WebP estático) a otro formato y, con `tam`, a otro tamaño. */
export function convertirImagen(imagen: Buffer, formato: Formato = 'png', calidad = 88, tam?: Tamano): Promise<Buffer> {
  const params = { formato, calidad, ancho: tam?.ancho, alto: tam?.alto, ajuste: tam ? (tam.ajuste ?? 'inside') : undefined }
  return pedir('/image/convert', imagen, params)
}
