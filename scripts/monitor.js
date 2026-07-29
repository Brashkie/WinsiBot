import { join } from 'path'
import { venvPythonPath } from './_platform.js'
import { runChild } from './_spawn.js'

const python = venvPythonPath()
const script = join(process.cwd(), 'python', 'terminal', 'monitor.py')

runChild(python, [script], { label: 'monitor.py', forwardSignals: true })
