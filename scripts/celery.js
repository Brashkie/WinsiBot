import { spawn } from 'child_process'
import { join } from 'path'

const python  = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const cwd     = join(process.cwd(), 'python')

// El pool "prefork" (default de Celery) usa multiprocessing al estilo POSIX
// (fork + semáforos/locks compartidos vía billiard) que Windows no soporta
// bien — produce WinError 5/6 al azar en los workers. "solo" corre todo en
// un solo proceso sin esas primitivas, evitando el bug por completo.
const isWindows = process.platform === 'win32'

const proc = spawn(python, [
  '-m', 'celery',
  '-A', 'api.celery_app',
  'worker',
  '--loglevel=warning',
  ...(isWindows ? ['--pool=solo'] : ['--concurrency=2']),
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