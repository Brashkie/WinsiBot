// Leer MessagePack: los catálogos de #rw (marvel, pokédex, anime) y de los
// dragones, que vienen de Brashkie/module-data en ese formato.
//
// Reemplaza a `@msgpack/msgpack`, que se usaba solo para `decode` en esos
// dos lugares. El formato es una lista corta de tipos, cada uno con su byte
// de cabecera; scripts/msgpack.test.js comprueba que los cuatro catálogos de
// verdad se leen igual que con la librería.
//
// Solo lee, y solo lo que JSON puede representar más los binarios (como
// Uint8Array). Las extensiones —que esos catálogos no usan— dan error en vez
// de un valor inventado.
//
// Lógica pura, sin alias: se prueba sin arrancar el bot.

const texto = new TextDecoder('utf-8')

export function decodificar(datos: Uint8Array): unknown {
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength)
  let i = 0

  const u8 = () => datos[i++]!
  const u16 = () => { const v = vista.getUint16(i); i += 2; return v }
  const u32 = () => { const v = vista.getUint32(i); i += 4; return v }
  const bytes = (n: number) => {
    if (i + n > datos.length) throw new RangeError('MessagePack cortado')
    const b = datos.subarray(i, i + n)
    i += n
    return b
  }
  // Las cadenas cortas y ASCII —las claves y casi todos los nombres— se arman
  // a mano: `TextDecoder` tiene un costo fijo por llamada que, en un catálogo
  // de miles de claves cortas, pesa más que decodificar. Se probó también
  // decodificar UTF-8 a mano hasta 200 bytes, como la librería: los cuatro
  // catálogos salieron más lentos (33 ms contra 23,5), y se sacó.
  const cadena = (n: number) => {
    const b = bytes(n)
    if (n <= 32) {
      let s = ''
      for (let k = 0; k < n; k++) {
        const c = b[k]!
        if (c > 0x7f) return texto.decode(b)
        s += String.fromCharCode(c)
      }
      return s
    }
    return texto.decode(b)
  }
  const lista = (n: number) => {
    const a: unknown[] = new Array(n)
    for (let k = 0; k < n; k++) a[k] = valor()
    return a
  }
  // Las claves se repiten miles de veces —cada dragón tiene las mismas— y se
  // guardan ya decodificadas, buscadas por sus bytes. Es lo que hacía la
  // librería, y sin esto el catálogo de dragones (30.380 claves) se leía un
  // 40% más lento que con ella.
  const claves = new Map<number, { b: Uint8Array; s: string }[]>()
  const clave = (): unknown => {
    const c = datos[i]!
    if ((c & 0xe0) !== 0xa0 || (c & 0x1f) > 16) return valor()
    const n = c & 0x1f
    const b = datos.subarray(i + 1, i + 1 + n)
    let h = n
    for (let k = 0; k < n; k++) h = (Math.imul(h, 31) + b[k]!) | 0
    const cubo = claves.get(h)
    if (cubo) {
      for (const e of cubo) {
        if (e.b.length === n && e.b.every((x, k) => x === b[k])) {
          i += 1 + n
          return e.s
        }
      }
    }
    i += 1
    const s = cadena(n)
    if (cubo) cubo.push({ b, s })
    else claves.set(h, [{ b, s }])
    return s
  }
  const mapa = (n: number) => {
    const o: Record<string, unknown> = {}
    for (let k = 0; k < n; k++) {
      const c = clave()
      o[String(c)] = valor()
    }
    return o
  }

  function valor(): unknown {
    if (i >= datos.length) throw new RangeError('MessagePack cortado')
    const c = u8()
    if (c <= 0x7f) return c // positive fixint
    if (c >= 0xe0) return c - 0x100 // negative fixint
    if ((c & 0xf0) === 0x80) return mapa(c & 0x0f) // fixmap
    if ((c & 0xf0) === 0x90) return lista(c & 0x0f) // fixarray
    if ((c & 0xe0) === 0xa0) return cadena(c & 0x1f) // fixstr
    switch (c) {
      case 0xc0: return null
      case 0xc2: return false
      case 0xc3: return true
      case 0xc4: return bytes(u8()).slice()
      case 0xc5: return bytes(u16()).slice()
      case 0xc6: return bytes(u32()).slice()
      case 0xca: { const v = vista.getFloat32(i); i += 4; return v }
      case 0xcb: { const v = vista.getFloat64(i); i += 8; return v }
      case 0xcc: return u8()
      case 0xcd: return u16()
      case 0xce: return u32()
      case 0xcf: { const v = vista.getBigUint64(i); i += 8; return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v }
      case 0xd0: { const v = vista.getInt8(i); i += 1; return v }
      case 0xd1: { const v = vista.getInt16(i); i += 2; return v }
      case 0xd2: { const v = vista.getInt32(i); i += 4; return v }
      case 0xd3: { const v = vista.getBigInt64(i); i += 8; return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v }
      case 0xd9: return cadena(u8())
      case 0xda: return cadena(u16())
      case 0xdb: return cadena(u32())
      case 0xdc: return lista(u16())
      case 0xdd: return lista(u32())
      case 0xde: return mapa(u16())
      case 0xdf: return mapa(u32())
      default: throw new TypeError(`MessagePack: tipo 0x${c.toString(16)} no soportado`)
    }
  }

  const v = valor()
  return v
}
