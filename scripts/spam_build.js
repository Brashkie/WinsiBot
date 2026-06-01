import { spawn } from 'child_process'
import { join } from 'path'

const python = join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
const script = join(process.cwd(), 'python', 'cython_ext', 'spam_guard_build.py')
const cwd    = join(process.cwd(), 'python', 'cython_ext')

const proc = spawn(python, [script], { stdio: 'inherit', cwd })
proc.on('error', (err) => { console.error(`✗ ${err.message}`); process.exit(1) })
proc.on('exit',  (code) => { if (code !== 0) process.exit(code ?? 1) })