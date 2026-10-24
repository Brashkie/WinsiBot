// Texto a voz LOCAL: ningún servicio de internet, el audio se genera en la
// misma máquina con el primer motor que haya:
//
//   piper   — la mejor calidad (voces neuronales en ONNX). Hay que bajar el
//             binario y una voz: PIPER_MODEL=/ruta/es_MX-claude-high.onnx
//   espeak  — espeak-ng o espeak. Robótica pero liviana: en Termux es
//             `pkg install espeak`, en Debian/Ubuntu `apt install espeak-ng`
//   sapi    — la voz que trae Windows (Helena, es-ES), sin instalar nada
//   say     — la que trae macOS
//
// TTS_MOTOR fuerza uno; si no, se prueban en ese orden y se recuerda el que
// funcionó. El WAV se pasa a Opus con ffmpeg para mandarlo como nota de voz.
//
// Ningún motor se llama con shell, y el texto va por stdin o por archivo,
// nunca en la línea de comandos: lo escribe cualquiera del grupo.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { IS_WINDOWS, IS_MAC, binPath } from './platform.js'
import { ffmpegPath } from './ffmpeg.js'
import { carpetaTmp } from './utils.js'

const run = promisify(execFile)
const TIMEOUT = 30_000

export const MAX_CARACTERES = 400

export type Motor = 'piper' | 'espeak' | 'sapi' | 'say'

/** Limpia lo que no se puede o no se debe leer en voz alta. */
export function limpiar(texto: string): string {
  return texto
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' enlace ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CARACTERES)
}

function binario(nombre: string): string {
  const propio = binPath(nombre)
  return existsSync(propio) ? propio : nombre
}

/** Cada motor escribe un WAV en `wav` (o AIFF, en macOS) leyendo de `txt`. */
async function sintetizar(motor: Motor, txt: string, wav: string, texto: string): Promise<void> {
  const voz = process.env.TTS_VOZ
  switch (motor) {
    case 'piper': {
      const modelo = process.env.PIPER_MODEL
      if (!modelo || !existsSync(modelo)) throw new Error('PIPER_MODEL no está configurado')
      await conStdin(binario('piper'), ['--model', modelo, '--output_file', wav], texto)
      return
    }
    case 'espeak': {
      const args = ['-v', voz || 'es-419', '-s', '160', '-w', wav, '-f', txt]
      try {
        await run(binario('espeak-ng'), args, { timeout: TIMEOUT })
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err
        await run(binario('espeak'), args, { timeout: TIMEOUT })
      }
      return
    }
    case 'sapi': {
      if (!IS_WINDOWS) throw new Error('SAPI solo existe en Windows')
      // Las rutas van por variables de entorno: el script es fijo.
      const script = [
        'Add-Type -AssemblyName System.Speech',
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        '$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like "es*" } | Select-Object -First 1',
        'if ($env:WINSI_TTS_VOZ) { $s.SelectVoice($env:WINSI_TTS_VOZ) } elseif ($v) { $s.SelectVoice($v.VoiceInfo.Name) }',
        '$s.SetOutputToWaveFile($env:WINSI_TTS_OUT)',
        '$s.Speak([IO.File]::ReadAllText($env:WINSI_TTS_IN, [Text.Encoding]::UTF8))',
        '$s.Dispose()',
      ].join('; ')
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        timeout: TIMEOUT,
        env: { ...process.env, WINSI_TTS_IN: txt, WINSI_TTS_OUT: wav, WINSI_TTS_VOZ: voz ?? '' },
        windowsHide: true,
      })
      return
    }
    case 'say': {
      if (!IS_MAC) throw new Error('say solo existe en macOS')
      try {
        await run('say', ['-v', voz || 'Paulina', '-o', wav, '-f', txt], { timeout: TIMEOUT })
      } catch {
        await run('say', ['-o', wav, '-f', txt], { timeout: TIMEOUT })
      }
    }
  }
}

function conStdin(bin: string, args: string[], texto: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = execFile(bin, args, { timeout: TIMEOUT }, err => (err ? reject(err) : resolve()))
    p.stdin?.end(texto, 'utf8')
  })
}

const ORDEN: Motor[] = ['piper', 'espeak', 'sapi', 'say']
let elegido: Motor | null = null

function candidatos(): Motor[] {
  const forzado = process.env.TTS_MOTOR?.toLowerCase() as Motor | undefined
  if (forzado && ORDEN.includes(forzado)) return [forzado]
  return elegido ? [elegido, ...ORDEN.filter(m => m !== elegido)] : ORDEN
}

// De a una síntesis por vez: cada una es un proceso que come CPU, y en un
// teléfono dos a la vez se notan en todo lo demás.
let cola: Promise<unknown> = Promise.resolve()

export interface Voz { audio: Buffer; motor: Motor }

/** La nota de voz en Ogg/Opus, o un error que dice qué motores se probaron. */
export function hablar(textoCrudo: string): Promise<Voz> {
  const tarea = cola.then(() => generar(textoCrudo))
  cola = tarea.catch(() => {})
  return tarea
}

async function generar(textoCrudo: string): Promise<Voz> {
  const texto = limpiar(textoCrudo)
  if (!texto) throw new Error('texto vacío')

  const dir = await carpetaTmp()
  const id  = randomUUID()
  const txt = join(dir, `${id}.txt`)
  const wav = join(dir, `${id}.${IS_MAC ? 'aiff' : 'wav'}`)
  const ogg = join(dir, `${id}.ogg`)
  const fallos: string[] = []

  try {
    await writeFile(txt, texto, 'utf8')
    for (const motor of candidatos()) {
      try {
        await sintetizar(motor, txt, wav, texto)
        if (!existsSync(wav)) throw new Error('no generó audio')
        await run(ffmpegPath(), [
          '-y', '-i', wav, '-ac', '1', '-ar', '48000',
          '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', ogg,
        ], { timeout: TIMEOUT, windowsHide: true })
        elegido = motor
        return { audio: await readFile(ogg), motor }
      } catch (err: any) {
        fallos.push(`${motor}: ${err?.code === 'ENOENT' ? 'no instalado' : String(err?.message ?? err).split('\n')[0]}`)
      }
    }
    throw new Error(`ningún motor de voz funcionó (${fallos.join('; ')})`)
  } finally {
    for (const f of [txt, wav, ogg]) await unlink(f).catch(() => {})
  }
}
