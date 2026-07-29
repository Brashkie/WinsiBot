// build_cython.js — entrypoint único para "npm run cython:build", en vez de
// build_cython.ps1 (solo Windows, PowerShell no existe en Linux/macOS/Termux)
// + python/cython_ext/build.sh (solo POSIX) por separado. `setup.py
// build_ext --inplace` ya es portable por sí solo (setuptools/cythonize
// resuelven el compilador y el sufijo del binario según el SO) — lo único
// que cambiaba entre los dos scripts viejos era qué Python del venv usar.
import { spawn } from 'child_process'
import { join } from 'path'
import { venvPythonPath } from './_platform.js'

const python = venvPythonPath()
const cwd    = join(process.cwd(), 'python', 'cython_ext')

console.log('Compilando módulos Cython...')

const proc = spawn(python, ['setup.py', 'build_ext', '--inplace'], {
  stdio: 'inherit',
  cwd,
})

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo compilar — ¿existe el venv? (${python}): ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`  ✗ Compilación falló con código ${code}`)
    process.exit(code)
  }
  console.log('Compilación completada')
})
