import { join } from 'path'
import { venvPythonPath } from './_platform.js'
import { runChild } from './_spawn.js'

const python = venvPythonPath()
const cwd    = join(process.cwd(), 'python')

runChild(python, ['-c',
  "import sys; sys.path.insert(0,'.'); from ai.health_monitor import run_once, print_report; print_report(run_once())",
], {
  cwd,
  label: 'health check',
  onExitCode: (code) => { if (code !== 0) process.exit(code ?? 1) },
})
