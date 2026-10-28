#!/usr/bin/env node
// npm run bench:hops — cuánto cuesta un viaje de Node a la Session API.
//
// Mide desde Node, con el mismo cliente que usa el bot (nativeBridge.ts), el
// costo de `analyzeIntent`: N llamadas seguidas y N en paralelo, con mediana y
// p95, y el CPU que gasta el PROCESO DE NODE en hacerlas. Es lo que se paga por
// cada viaje que el handler hace por mensaje, así que dice cuánto vale quitar
// uno.
//
// Necesita la Session API corriendo y SESSION_API_URL/SESSION_API_KEY en el
// entorno (o en .env).

import './env.js'
import { pathToFileURL } from 'url'
import { join } from 'path'

const N = Number(process.argv[2] ?? 2000)
const { analyzeIntent } = await import(pathToFileURL(join(process.cwd(), 'dist/lib/nativeBridge.js')).href)

const textos = [
  'hola bot como estas', 'jajaja que buena', '#menu', 'alguien juega free fire hoy?',
  'buenas noches a todos', 'eres un idiota', 'mira este link https://x.y', 'te quiero mucho bot',
]

const mediana = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]
const p95 = (a) => a.sort((x, y) => x - y)[Math.floor(a.length * 0.95)]

async function medir(etiqueta, fn) {
  const cpu0 = process.cpuUsage()
  const t0 = performance.now()
  const lat = await fn()
  const total = performance.now() - t0
  const cpu = process.cpuUsage(cpu0)
  const cpuMs = (cpu.user + cpu.system) / 1000
  console.log(
    `  ${etiqueta.padEnd(30)} mediana ${mediana(lat).toFixed(3)} ms   p95 ${p95(lat).toFixed(3)} ms   ` +
      `CPU de Node ${(cpuMs / N * 1000).toFixed(0)} µs/llamada   total ${total.toFixed(0)} ms`,
  )
}

// Calentar: conexiones y JIT.
for (let i = 0; i < 200; i++) await analyzeIntent(textos[i % textos.length])

await medir('seguidas', async () => {
  const lat = []
  for (let i = 0; i < N; i++) {
    const t = performance.now()
    await analyzeIntent(textos[i % textos.length] + ' ' + i)
    lat.push(performance.now() - t)
  }
  return lat
})

await medir('de a 8 en paralelo', async () => {
  const lat = []
  for (let i = 0; i < N; i += 8) {
    await Promise.all(Array.from({ length: 8 }, async (_, k) => {
      const t = performance.now()
      await analyzeIntent(textos[k] + ' ' + i)
      lat.push(performance.now() - t)
    }))
  }
  return lat
})
process.exit(0)
