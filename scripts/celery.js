import { spawn } from 'child_process'
import { join } from 'path'

const python  = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const cwd     = join(process.cwd(), 'python')

const proc = spawn(python, [
  '-m', 'celery',
  '-A', 'api.celery_app',
  'worker',
  '--loglevel=warning',
  '--concurrency=2',
], {
  stdio: 'inherit',
  cwd,                    // ← corre desde python/
})

proc.on('error', (err) => {
  console.error(`  ✗ No se pudo iniciar Celery: ${err.message}`)
  process.exit(1)
})

proc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`  ✗ Celery terminó con código ${code}`)
    process.exit(code)
  }
})

process.on('SIGINT',  () => { proc.kill('SIGINT');  process.exit(0) })
process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0) })