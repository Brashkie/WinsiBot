import { spawn } from 'child_process'
import { join } from 'path'

const python = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const cwd    = join(process.cwd(), 'python')
const fix    = process.argv.includes('--fix')

const args = ['-m', 'ruff', 'check', '.', ...(fix ? ['--fix'] : [])]

const proc = spawn(python, args, { stdio: 'inherit', cwd })

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo correr ruff — ¿instalaste las dependencias de dev? (pip install -r python/requirements-dev.txt): ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code) => process.exit(code ?? 1))
