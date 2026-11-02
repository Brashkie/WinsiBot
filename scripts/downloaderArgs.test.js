// Que el texto de un usuario nunca llegue a un shell (src/lib/downloader.ts).
// Hasta la 9.2, `#play $(comando)` ejecutaba el comando en la máquina.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@config', () => ({ USER_AGENT: 'test' }))

const { argsYtdlp, objetivoDe } = await import('../src/lib/downloader.ts')
const run = promisify(execFile)

const dir = mkdtempSync(join(tmpdir(), 'winsi-inyeccion-'))
const testigo = join(dir, 'pwned')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const ATAQUES = [
  `$(node -e "require('fs').writeFileSync('${testigo.replace(/\\/g, '/')}','x')")`,
  `\`node -e "require('fs').writeFileSync('${testigo.replace(/\\/g, '/')}','x')"\``,
  `x" & node -e "require('fs').writeFileSync('${testigo.replace(/\\/g, '/')}','x')" & "`,
  `x"; node -e "require('fs').writeFileSync('${testigo.replace(/\\/g, '/')}','x')"; "`,
  '--exec "rm -rf ~"',
]

describe('yt-dlp sin shell', () => {
  it('una búsqueda lleva ytsearch1:, un link va tal cual', () => {
    expect(objetivoDe('despacito')).toBe('ytsearch1:despacito')
    expect(objetivoDe('https://youtu.be/x')).toBe('https://youtu.be/x')
    expect(objetivoDe('--exec "rm -rf ~"')).toBe('ytsearch1:--exec "rm -rf ~"')
  })

  it('el objetivo va último, después de --, y entero en un solo argumento', () => {
    for (const q of ATAQUES) {
      const a = argsYtdlp('/bin/ffmpeg', ['-x'], objetivoDe(q))
      expect(a.slice(-2)).toEqual(['--', `ytsearch1:${q}`])
      expect(a.slice(0, 3)).toEqual(['--ffmpeg-location', '/bin/ffmpeg', '-x'])
    }
    expect(argsYtdlp('', ['-x'], 'u')).toEqual(['-x', '--', 'u'])
  })

  it('pasados por execFile, llegan como texto y no se ejecuta nada', async () => {
    // `node` hace de yt-dlp: imprime los argumentos que recibió. El 'yt-dlp'
    // de adelante es para que node no se quede con el `--` como suyo.
    const eco = ['-e', 'console.log(JSON.stringify(process.argv.slice(2)))', 'yt-dlp']
    for (const q of ATAQUES) {
      const { stdout } = await run(process.execPath, [...eco, ...argsYtdlp('', [], objetivoDe(q))])
      expect(JSON.parse(stdout)).toEqual(['--', `ytsearch1:${q}`])
    }
    expect(existsSync(testigo)).toBe(false)
  })
})
