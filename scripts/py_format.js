import { spawn } from 'child_process'
import { join } from 'path'

const python = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const cwd    = join(process.cwd(), 'python')
const check  = process.argv.includes('--check')

const args = ['-m', 'ruff', 'format', ...(check ? ['--check'] : []), '.']

const proc = spawn(python, args, { stdio: 'inherit', cwd })

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo correr ruff — ¿instalaste las dependencias de dev? (pip install -r python/requirements-dev.txt): ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code) => process.exit(code ?? 1))
