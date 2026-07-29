import { join } from 'path'
import { existsSync } from 'fs'
import { venvPythonPath, systemPython } from './_platform.js'
import { runChild } from './_spawn.js'

const venvPython = venvPythonPath()
const python     = existsSync(venvPython) ? venvPython : systemPython()
const script     = join(process.cwd(), 'python', 'terminal', 'manage.py')

// Pasar todos los argumentos extra (ej: "reset-qr", "status", etc.)
const args = [script, ...process.argv.slice(2)]

runChild(python, args, {
  label: 'manage.py',
  forwardSignals: true,
  onExitCode: (code) => process.exit(code ?? 0),
})
