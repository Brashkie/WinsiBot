import { spawn } from 'child_process'
import { join } from 'path'

const python = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const script = join(process.cwd(), 'python', 'terminal', 'monitor.py')

const proc = spawn(python, [script], { stdio: 'inherit' })

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo iniciar monitor.py: ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`  ✗ monitor.py terminó con código ${code}`)
    process.exit(code)
  }
})

process.on('SIGINT',  () => { proc.kill('SIGINT');  process.exit(0) })
process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0) })