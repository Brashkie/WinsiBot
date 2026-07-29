import { join } from 'path'
import { venvPythonPath, IS_WINDOWS } from './_platform.js'
import { runChild } from './_spawn.js'

const python = venvPythonPath()
const cwd    = join(process.cwd(), 'python')

runChild(python, [
  '-m', 'celery',
  '-A', 'api.celery_app',
  'worker',
  '--loglevel=warning',
  // El pool "prefork" (default de Celery) usa multiprocessing al estilo POSIX
  // (fork + semáforos/locks compartidos vía billiard) que Windows no soporta
  // bien — produce WinError 5/6 al azar en los workers. "solo" corre todo en
  // un solo proceso sin esas primitivas, evitando el bug por completo.
  ...(IS_WINDOWS ? ['--pool=solo'] : ['--concurrency=2']),
], { cwd, label: 'Celery', forwardSignals: true })
