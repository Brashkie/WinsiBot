#!/usr/bin/env node
// npm run mem:profile — cuánta RAM agrega cada pieza del bot al proceso.
//
// Antes de mover algo a C, C++ o Zig "para que consuma menos", hay que saber
// dónde está el consumo: reescribir en otro lenguaje algo que pesa 2 MB no
// cambia nada, y lo que pesa 40 MB puede pesar eso por cómo se carga y no por
// el lenguaje en que está escrito.
//
// Carga las piezas en orden, de a una, con el recolector forzado antes de cada
// medida, y reporta lo que suma cada una: RSS (lo que el sistema le da al
// proceso) y heap de V8 (lo que ocupan los objetos de JS). No conecta a
// WhatsApp: arrancar el bot con la cuenta real expulsaría a la instancia de
// producción.
//
// Uso: npm run mem:profile            el arranque real del bot
//      npm run mem:profile -- --deps  lo que pesa cada dependencia sola

import { pathToFileURL } from 'url'
import { join } from 'path'

if (typeof globalThis.gc !== 'function') {
  console.error('Correlo con --expose-gc (npm run mem:profile ya lo pasa).')
  process.exit(1)
}

const mb = (b) => (b / 1048576).toFixed(1).padStart(6)
function snap() {
  for (let i = 0; i < 3; i++) globalThis.gc()
  const m = process.memoryUsage()
  return { rss: m.rss, heap: m.heapUsed, ext: m.external + m.arrayBuffers }
}

const rows = []
let prev = snap()
rows.push(['node vacío', prev, prev])

async function step(label, fn) {
  const t0 = performance.now()
  await fn()
  const ms = performance.now() - t0
  const now = snap()
  rows.push([label, now, prev, ms])
  prev = now
}

const dist = (p) => pathToFileURL(join(process.cwd(), 'dist', p)).href

const deps = process.argv.includes('--deps')

if (deps) {
  // --deps: cada dependencia de terceros sola, en el orden del arranque. Sirve
  // para saber qué pesa; NO es lo que carga el bot, que puede no tocar alguna.
  for (const dep of [
    '@whiskeysockets/baileys', 'pino', 'ansimax', 'axios', 'cbor-x', 'zod', 'hono', 'ws',
    'cheerio', 'openai', 'moment-timezone', '@spotify/web-api-ts-sdk', '@vitalets/google-translate-api',
    'wa-sticker-formatter', 'fluent-ffmpeg', 'file-type', 'node-cron', 'qrcode', '@brashkie/signalis-core',
  ]) {
    try {
      await step(dep, () => import(dep))
    } catch (e) {
      rows.push([`${dep} (no carga: ${e.code ?? e.message})`, prev, prev])
    }
  }
} else {
  // Por defecto: el arranque de verdad, y nada más. Baileys primero para
  // separar su peso, que no depende de este proyecto.
  await step('Baileys', () => import('@whiskeysockets/baileys'))
  await step('núcleo del bot (socket, handler)', async () => {
    await import(dist('core/socket.js'))
    await import(dist('core/handler.js'))
  })
}
await step('todos los comandos (loadCommands)', async () => {
  const { loadCommands } = await import(dist('plugins/commands/index.js'))
  await loadCommands()
})
const arranque = prev

if (!deps) {
  // Lo que se carga AL USARSE y no al arrancar. Si cuesta algo acá, es que el
  // arranque no lo había cargado: eso es lo que se ahorra quien no lo usa.
  await step('↳ después: cheerio (al primer #rule34video)', () => import('cheerio'))
  await step('↳ después: stickers (al primer #sticker)', () => import('wa-sticker-formatter'))
}

console.log()
console.log('  pieza                                         +RSS MB  +heap MB  +ext MB      ms')
console.log('  ' + '─'.repeat(84))
for (const [label, now, before, ms] of rows) {
  const d = (k) => mb(now[k] - before[k])
  console.log(`  ${label.slice(0, 44).padEnd(44)} ${d('rss')}    ${d('heap')}   ${d('ext')}  ${ms ? ms.toFixed(0).padStart(6) : '      '}`)
}
console.log('  ' + '─'.repeat(84))
console.log(`  ARRANQUE, proceso entero                     ${mb(arranque.rss)}    ${mb(arranque.heap)}   ${mb(arranque.ext)}`)
process.exit(0)
