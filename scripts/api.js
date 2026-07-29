import { join } from 'path'
import { venvPythonPath } from './_platform.js'
import { runChild } from './_spawn.js'

const python = venvPythonPath()
const cwd    = join(process.cwd(), 'python')

runChild(python, [
  '-m', 'uvicorn',
  'api.app:app',
  '--host', '127.0.0.1',
  '--port', '5000',
  '--workers', '1',
  '--log-level', 'warning',
  '--no-access-log',
], { cwd, label: 'FastAPI', forwardSignals: true })
