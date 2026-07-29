// _platform.js — misma lógica que src/lib/platform.ts, en JS plano.
// Los scripts de esta carpeta corren directo con `node scripts/x.js`, sin
// pasar por tsc (tsconfig.json tiene rootDir/include limitados a src/, así
// que ninguno de los dos puede importar del otro sin romper esa frontera:
// scripts/ debe poder correr ANTES de cualquier build — ver setup.js — y
// src/ debe quedarse dentro de rootDir para que tsc/tsc-alias compilen
// limpio). Se duplica acá a propósito en vez de repetir la rama de
// plataforma en cada script — scripts/_platform.test.js falla si este
// archivo y src/lib/platform.ts alguna vez quedan desincronizados.

import { join } from 'path'

export const IS_WINDOWS = process.platform === 'win32'
export const IS_MAC     = process.platform === 'darwin'
export const IS_LINUX   = process.platform === 'linux'

export function exeName(name) {
  return IS_WINDOWS ? `${name}.exe` : name
}

export function venvPythonPath(cwd = process.cwd()) {
  return IS_WINDOWS
    ? join(cwd, 'python', 'venv', 'Scripts', 'python.exe')
    : join(cwd, 'python', 'venv', 'bin', 'python')
}

export function venvBinPath(name, cwd = process.cwd()) {
  return IS_WINDOWS
    ? join(cwd, 'python', 'venv', 'Scripts', exeName(name))
    : join(cwd, 'python', 'venv', 'bin', name)
}

export function systemPython() {
  return IS_WINDOWS ? 'python' : 'python3'
}
