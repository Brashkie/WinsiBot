// El tipo de un archivo por sus primeros bytes (ver src/lib/mime.ts), con
// archivos de verdad: las imágenes de fixtures/images/ (hechas con sharp antes
// de sacarlo, en la 9.4.0) y, si está, ffmpeg.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dimensiones, mimeDe } from '../src/lib/mime.ts'
import { imagen } from './fixtures/imageHelpers.js'

// ffmpeg-static es opcional: sin él, el de video y audio se saltea.
let ffmpeg = null
try { ffmpeg = (await import('ffmpeg-static')).default } catch { /* sin ffmpeg */ }

describe('mimeDe', () => {
  it('imágenes de verdad', () => {
    expect(mimeDe(imagen('small.jpeg'))).toBe('image/jpeg')
    expect(mimeDe(imagen('small.png'))).toBe('image/png')
    expect(mimeDe(imagen('lossy.webp'))).toBe('image/webp')
    expect(mimeDe(imagen('small.gif'))).toBe('image/gif')
  })

  it.skipIf(!ffmpeg)('video y audio hechos por ffmpeg', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mime-'))
    try {
      const hacer = (args, nombre) => {
        execFileSync(ffmpeg, ['-v', 'error', '-y', ...args, join(dir, nombre)])
        return readFileSync(join(dir, nombre))
      }
      const video = ['-f', 'lavfi', '-i', 'color=c=red:s=16x16:d=0.2']
      const audio = ['-f', 'lavfi', '-i', 'sine=d=0.2']
      expect(mimeDe(hacer([...video, '-pix_fmt', 'yuv420p'], 'a.mp4'))).toBe('video/mp4')
      expect(mimeDe(hacer([...video, '-c:v', 'libvpx'], 'a.webm'))).toBe('video/webm')
      expect(mimeDe(hacer([...audio, '-c:a', 'libopus'], 'a.ogg'))).toBe('audio/ogg')
      expect(mimeDe(hacer(audio, 'a.mp3'))).toBe('audio/mpeg')
      expect(mimeDe(hacer(audio, 'a.wav'))).toBe('audio/wav')
      expect(mimeDe(hacer(audio, 'a.m4a'))).toBe('audio/mp4')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('lo que no reconoce, y lo corto, como octet-stream', () => {
    expect(mimeDe(Buffer.from('hola, esto es texto'))).toBe('application/octet-stream')
    expect(mimeDe(Buffer.alloc(0))).toBe('application/octet-stream')
    expect(mimeDe(Buffer.from([0xff]))).toBe('application/octet-stream')
    expect(mimeDe(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf')
  })
})

describe('dimensiones', () => {
  it('PNG, JPEG (también progresivo) y los tres WebP (con pérdida, sin pérdida y extendido)', () => {
    for (const [w, h] of [[1, 1], [37, 1201], [1536, 1024]]) {
      // Con alfa, WebP usa la cabecera extendida (VP8X).
      for (const tipo of ['png', 'jpeg', 'progressive.jpeg', 'lossy.webp', 'lossless.webp', 'alpha.webp']) {
        const nombre = tipo.includes('.') ? `size-${w}x${h}-${tipo}` : `size-${w}x${h}.${tipo}`
        expect(dimensiones(imagen(nombre)), nombre).toEqual({ ancho: w, alto: h })
      }
    }
  })

  it('lo que no es imagen, o está cortado, da null', () => {
    expect(dimensiones(Buffer.from('hola'))).toBeNull()
    expect(dimensiones(imagen('small.png').subarray(0, 20))).toBeNull()
    expect(dimensiones(imagen('small.jpeg').subarray(0, 30))).toBeNull()
  })
})
