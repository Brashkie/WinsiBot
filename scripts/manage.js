import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

const venvPython = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const python     = existsSync(venvPython) ? venvPython : 'python'
const script     = join(process.cwd(), 'python', 'terminal', 'manage.py')

// Pasar todos los argumentos extra (ej: "reset-qr", "status", etc.)
const args = [script, ...process.argv.slice(2)]

const proc = spawn(python, args, { stdio: 'inherit' })

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo iniciar manage.py: ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT',  () => { proc.kill('SIGINT');  process.exit(0) })
process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0) })
