// Verifica que _platform.js (JS plano, para scripts/ que corren sin tsc) y
// src/lib/platform.ts (mismo helper, para el resto del bot) se mantengan
// sincronizados — no pueden importarse entre sí (ver comentarios en ambos
// archivos), así que la única forma de detectar que se desincronizaron es
// comparar su comportamiento acá.
import { describe, expect, it } from 'vitest'
import * as js from './_platform.js'
import * as ts from '../src/lib/platform.ts'

describe('_platform.js vs src/lib/platform.ts', () => {
  it('exportan el mismo set de nombres', () => {
    expect(Object.keys(js).sort()).toEqual(Object.keys(ts).sort())
  })

  it('IS_WINDOWS/IS_MAC/IS_LINUX coinciden', () => {
    expect(js.IS_WINDOWS).toBe(ts.IS_WINDOWS)
    expect(js.IS_MAC).toBe(ts.IS_MAC)
    expect(js.IS_LINUX).toBe(ts.IS_LINUX)
  })

  it('exeName() coincide', () => {
    expect(js.exeName('yt-dlp')).toBe(ts.exeName('yt-dlp'))
  })

  it('venvPythonPath()/venvBinPath()/systemPython() coinciden', () => {
    const cwd = 'C:/fake/project'
    expect(js.venvPythonPath(cwd)).toBe(ts.venvPythonPath(cwd))
    expect(js.venvBinPath('yt-dlp', cwd)).toBe(ts.venvBinPath('yt-dlp', cwd))
    expect(js.systemPython()).toBe(ts.systemPython())
  })
})
