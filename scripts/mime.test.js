// El tipo de un archivo por sus primeros bytes (ver src/lib/mime.ts), con
// archivos de verdad: los arma sharp y, si está, ffmpeg.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { mimeDe } from '../src/lib/mime.ts'

// ffmpeg-static es opcional: sin él, el de video y audio se saltea.
let ffmpeg = null
try { ffmpeg = (await import('ffmpeg-static')).default } catch { /* sin ffmpeg */ }

const imagen = (fmt) => sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })[fmt]().toBuffer()

describe('mimeDe', () => {
  it('imágenes hechas por sharp', async () => {
    expect(mimeDe(await imagen('jpeg'))).toBe('image/jpeg')
    expect(mimeDe(await imagen('png'))).toBe('image/png')
    expect(mimeDe(await imagen('webp'))).toBe('image/webp')
    expect(mimeDe(await imagen('gif'))).toBe('image/gif')
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
