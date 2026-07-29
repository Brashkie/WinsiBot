import { spawn } from 'child_process'
import { join } from 'path'
import { venvPythonPath } from './_platform.js'

const python = venvPythonPath()
const cwd    = join(process.cwd(), 'python')

const proc = spawn(python, ['-c',
  "import sys; sys.path.insert(0,'.'); from ai.health_monitor import run_once, print_report; print_report(run_once())"
], { stdio: 'inherit', cwd })
proc.on('error', (err) => { console.error(`✗ ${err.message}`); process.exit(1) })
proc.on('exit',  (code) => { if (code !== 0) process.exit(code ?? 1) })