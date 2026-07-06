import { spawn } from 'child_process'

// Redis es opcional — si no está instalado, el bot sigue funcionando sin caché
// distribuida. Por eso un fallo acá nunca debe tirar abajo al resto de
// servicios que corren junto a este en concurrently.
const proc = spawn('redis-server', [], { stdio: 'inherit' })

proc.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('  ⚠ Redis no está instalado — se sigue sin caché distribuida')
  } else {
    console.warn(`  ⚠ No se pudo iniciar Redis: ${err.message}`)
  }
  process.exit(0)
})

proc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`  ⚠ Redis terminó con código ${code}`)
  }
  process.exit(0)
})

process.on('SIGINT',  () => { proc.kill('SIGINT');  process.exit(0) })
process.on('SIGTERM', () => { proc.kill('SIGTERM'); process.exit(0) })
