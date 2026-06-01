import { spawn } from 'child_process'
import { join } from 'path'

const python = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const cwd    = join(process.cwd(), 'python')

const proc = spawn(python, [
  '-m', 'uvicorn',
  'api.app:app',
  '--host', '127.0.0.1',
  '--port', '5000',
  '--workers', '1',
  '--log-level', 'warning',
  '--no-access-log',
], {
  stdio: 'inherit',
  cwd,
})

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo iniciar FastAPI: ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`  ✗ FastAPI terminó con código ${code}`)
    process.exit(code)
  }
})

process.on('SIGINT',  () => { proc.kill('SIGINT');  process.exit(0) })
process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0) })