import { join } from 'path'
import { venvPythonPath } from './_platform.js'
import { runChild } from './_spawn.js'

const python = venvPythonPath()
const cwd    = join(process.cwd(), 'python')
const fix    = process.argv.includes('--fix')

const args = ['-m', 'ruff', 'check', '.', ...(fix ? ['--fix'] : [])]

runChild(python, args, {
  cwd,
  onError: (err) => {
    console.error(`  ✗ No se pudo correr ruff — ¿instalaste las dependencias de dev? (pip install -r python/requirements-dev.txt): ${err.message}`)
    process.exit(1)
  },
  onExitCode: (code) => process.exit(code ?? 1),
})
