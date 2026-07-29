import { join } from 'path'
import { venvPythonPath } from './_platform.js'
import { runChild } from './_spawn.js'

const python = venvPythonPath()
const script = join(process.cwd(), 'python', 'cython_ext', 'spam_guard_build.py')
const cwd    = join(process.cwd(), 'python', 'cython_ext')

runChild(python, [script], {
  cwd,
  label: 'spam_guard_build.py',
  onExitCode: (code) => { if (code !== 0) process.exit(code ?? 1) },
})
