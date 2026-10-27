// El modelo de Cosxamix (ver scripts/cosxamix_model.js): cuál le toca a cada
// máquina, y que la descarga por partes siga desde donde quedó, aguante un
// servidor sin `Range` y borre lo que no coincide.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODELOS, TOKENIZADOR, bajarArchivo, elegir, hayModelo } from './cosxamix_model.js'

const GB = 1024 ** 3

describe('elegir', () => {
  it('el más grande que entra en el 40% de la RAM', () => {
    expect(elegir(16 * GB, false).clave).toBe('3b')
    expect(elegir(8 * GB, false).clave).toBe('3b')
    expect(elegir(4 * GB, false).clave).toBe('1.5b')
    expect(elegir(2 * GB, false).clave).toBe('0.5b')
  })

  it('en Android, el 25%', () => {
    expect(elegir(8 * GB, true).clave).toBe('3b')
    expect(elegir(6 * GB, true).clave).toBe('1.5b')
    expect(elegir(3 * GB, true).clave).toBe('0.5b')
  })

  it('con muy poca RAM, el más chico igual: mejor eso que nada', () => {
    expect(elegir(1 * GB, true).clave).toBe('0.5b')
  })

  it('los tres apuntan a Qwen oficial y traen su SHA-256', () => {
    for (const m of [...MODELOS, TOKENIZADOR]) {
      expect(m.url).toMatch(/^https:\/\/huggingface\.co\/Qwen\//)
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

describe('bajarArchivo', () => {
  const datos = randomBytes(300_000)
  const bien = { bytes: datos.length, sha256: createHash('sha256').update(datos).digest('hex') }
  let servidor
  let base
  let conRango = true
  const dir = mkdtempSync(join(tmpdir(), 'cosxamix-modelo-'))

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const m = conRango && req.headers.range?.match(/bytes=(\d+)-/)
      if (m) {
        const desde = Number(m[1])
        res.writeHead(206, { 'content-length': datos.length - desde })
        res.end(datos.subarray(desde))
      } else {
        res.writeHead(200, { 'content-length': datos.length })
        res.end(datos)
      }
    })
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${servidor.address().port}/archivo`
  })
  afterAll(() => servidor.close())

  it('baja entero y lo deja con su nombre', async () => {
    const destino = join(dir, 'entero.gguf')
    await bajarArchivo({ url: base, ...bien }, destino)
    expect(readFileSync(destino).equals(datos)).toBe(true)
    expect(existsSync(`${destino}.part`)).toBe(false)
  })

  it('sigue desde donde quedó', async () => {
    conRango = true
    const destino = join(dir, 'cortado.gguf')
    writeFileSync(`${destino}.part`, datos.subarray(0, 123_456))
    await bajarArchivo({ url: base, ...bien }, destino)
    expect(readFileSync(destino).equals(datos)).toBe(true)
  })

  it('si el servidor no acepta Range, empieza de cero', async () => {
    conRango = false
    const destino = join(dir, 'sin-rango.gguf')
    writeFileSync(`${destino}.part`, datos.subarray(0, 50_000))
    await bajarArchivo({ url: base, ...bien }, destino)
    expect(readFileSync(destino).equals(datos)).toBe(true)
    conRango = true
  })

  it('lo que no coincide se borra y no queda con el nombre bueno', async () => {
    const destino = join(dir, 'malo.gguf')
    await expect(bajarArchivo({ url: base, bytes: bien.bytes, sha256: '0'.repeat(64) }, destino)).rejects.toThrow(/no coincide/)
    expect(existsSync(destino)).toBe(false)
    expect(existsSync(`${destino}.part`)).toBe(false)
  })

  it('hayModelo pide el modelo Y el tokenizador', () => {
    const d = mkdtempSync(join(tmpdir(), 'cosxamix-hay-'))
    expect(hayModelo(d)).toBe(false)
    writeFileSync(join(d, `${MODELOS[2].nombre}.gguf`), '')
    expect(hayModelo(d)).toBe(false)
    writeFileSync(join(d, TOKENIZADOR.nombre), '')
    expect(hayModelo(d)).toBe(true)
  })
})
