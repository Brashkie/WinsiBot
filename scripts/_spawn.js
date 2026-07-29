// _spawn.js — boilerplate compartido de spawn() para los scripts de esta
// carpeta: spawnear un proceso hijo con stdio heredado, reportar errores de
// arranque, propagar el código de salida y (opcionalmente) reenviar
// SIGINT/SIGTERM al hijo — antes repetido casi al carácter en 9 scripts.
import { spawn } from 'child_process'

export function runChild(command, args, {
  cwd,
  label = command,
  forwardSignals = false,
  onError,
  onExitCode,
} = {}) {
  const proc = spawn(command, args, { stdio: 'inherit', cwd })

  proc.on('error', onError ?? ((err) => {
    console.error(`  ✗ No se pudo iniciar ${label}: ${err.message}`)
    process.exit(1)
  }))

  proc.on('exit', onExitCode ?? ((code) => {
    if (code !== 0 && code !== null) {
      console.error(`  ✗ ${label} terminó con código ${code}`)
      process.exit(code)
    }
  }))

  if (forwardSignals) {
    process.on('SIGINT',  () => { proc.kill('SIGINT');  process.exit(0) })
    process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0) })
  }

  return proc
}
