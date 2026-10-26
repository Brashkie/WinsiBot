// Los efectos de audio (ver src/lib/audioFx.ts), con ffmpeg de verdad sobre
// un audio generado: que cada uno salga como Ogg/Opus válido, con la duración
// que corresponde a su cambio de velocidad.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { EFECTOS, efectoDe, argumentos, MAX_SEGUNDOS } from '../src/lib/audioFx.ts'

let ffmpeg = null
try { ffmpeg = (await import('ffmpeg-static')).default } catch { /* sin ffmpeg */ }

/** La duración de un archivo, leída de lo que ffmpeg dice al abrirlo. */
function duracion(archivo) {
  let salida = ''
  try { execFileSync(ffmpeg, ['-hide_banner', '-i', archivo], { stdio: 'pipe' }) } catch (e) { salida = String(e.stderr) }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(salida)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN
}

describe('efectos', () => {
  it('cada nombre y alias es de un solo efecto', () => {
    const vistos = new Map()
    for (const e of EFECTOS) {
      for (const k of [e.nombre, ...e.alias]) {
        expect(vistos.has(k), `${k} repetido (${vistos.get(k)} y ${e.nombre})`).toBe(false)
        vistos.set(k, e.nombre)
      }
    }
    expect(efectoDe('bassboost').nombre).toBe('bass')
    expect(efectoDe('nada')).toBeUndefined()
  })

  it('se corta a MAX_SEGUNDOS al leer, y sale Opus', () => {
    const a = argumentos(EFECTOS[0], 'in', 'out.ogg')
    expect(a.indexOf('-t')).toBeLessThan(a.indexOf('-i'))
    expect(a[a.indexOf('-t') + 1]).toBe(String(MAX_SEGUNDOS))
    expect(a).toContain('libopus')
  })

  it.skipIf(!ffmpeg)('los 13 con ffmpeg: Ogg válido y la duración que toca', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audiofx-'))
    try {
      // 4 s de un tono que sube, en un .m4a como el de una nota de WhatsApp.
      const entrada = join(dir, 'in.m4a')
      execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-af', 'vibrato=f=2', entrada])
      for (const e of EFECTOS) {
        const salida = join(dir, `${e.nombre}.ogg`)
        execFileSync(ffmpeg, argumentos(e, entrada, salida))
        const ogg = readFileSync(salida)
        expect(ogg.subarray(0, 4).toString('latin1'), e.nombre).toBe('OggS')
        expect(ogg.includes('OpusHead'), e.nombre).toBe(true)
        // Los ecos agregan su cola (hasta 1 s, el retardo más largo): más corto
        // que lo esperado, nunca.
        const d = duracion(salida)
        expect(d, e.nombre).toBeGreaterThan(4 / e.velocidad - 0.3)
        expect(d, e.nombre).toBeLessThan(4 / e.velocidad + 1.1)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
