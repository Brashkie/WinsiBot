#!/usr/bin/env node
// npm run chaos — provoca fallos a propósito y comprueba que el bot aguanta.
//
// El objetivo no es que "parezca" resistente, sino tener probados sus modos de
// fallo. Cada escenario rompe algo de verdad y después verifica un invariante
// concreto: no duplicar, no perder, recuperarse, no quedarse en bucle.
//
// Corre contra el código REAL compilado en dist/, no contra imitaciones, y en
// un sandbox aparte (su propio data/) para no tocar los datos de producción.
//
//   node scripts/chaos.js            todos los escenarios
//   node scripts/chaos.js dedup      solo los que coincidan con ese nombre
//
// El escenario del outbox necesita la API de Rust corriendo; se omite si no
// se le pasa CHAOS_RUST_URL en vez de fallar (ver el README).

import { mkdtempSync, rmSync, existsSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer } from 'http'
import { pathToFileURL } from 'url'
import { color } from 'ansimax'

const ROOT = process.cwd()
const DIST = (p) => pathToFileURL(join(ROOT, 'dist', p)).href

const only    = process.argv[2]
const results = []
const sleep   = (ms) => new Promise(r => setTimeout(r, ms))

// CHAOS_RUST_URL tiene que aplicarse ACÁ, antes del primer import de dist/.
//
// src/config.ts lee process.env una sola vez, al cargarse, y todos los módulos
// comparten ese objeto: no se vuelve a leer nunca. Ponerlo dentro del escenario
// —como estaba— no cambiaba nada, porque config.js ya llevaba rato cargado con
// la URL del .env; el cliente seguía llamando al puerto de siempre y el
// escenario del outbox fallaba con "fetch failed" aunque la API estuviera
// corriendo en el puerto que se le había pasado.
if (process.env.CHAOS_RUST_URL) {
  process.env.SESSION_API_URL = process.env.CHAOS_RUST_URL
}

function check(label, ok, detail = '') {
  results.push({ label, ok })
  const mark = ok ? color.green('OK') : color.red('XX')
  console.log(`     [${mark}] ${label}${detail ? color.dim(`  — ${detail}`) : ''}`)
}

async function scenario(name, desc, fn) {
  if (only && !name.includes(only)) return
  console.log(`\n  ${color.bold(color.cyan(`> ${name}`))}  ${color.dim(desc)}`)
  const sandbox = mkdtempSync(join(tmpdir(), 'winsi-chaos-'))
  const prevCwd = process.cwd()
  try {
    process.chdir(sandbox)
    await fn(sandbox)
  } catch (err) {
    check('el escenario no debería lanzar', false, String(err?.message ?? err).slice(0, 120))
  } finally {
    process.chdir(prevCwd)
    try { rmSync(sandbox, { recursive: true, force: true }) } catch {}
  }
}

// Importa con la caché invalidada — simula un proceso recién arrancado.
let _gen = 0
const freshImport = (p) => import(`${DIST(p)}?chaos=${++_gen}`)

// Importa la instancia COMPARTIDA, la misma que ven los demás módulos.
//
// La diferencia con freshImport() importa: el `?chaos=N` solo invalida la caché
// del módulo pedido, no la de sus dependencias. Así que `lib/session.js?chaos=3`
// es un módulo nuevo, pero su `import './circuitBreaker.js'` resuelve al
// especificador de siempre y recibe el circuito canónico. Pedir
// `circuitBreaker.js?chaos=4` devuelve un objeto DISTINTO, con sus contadores
// en cero y su propio estado: comprobarlo o reiniciarlo no dice nada del
// circuito que el bot está usando de verdad.
const sharedImport = (p) => import(DIST(p))

// ─────────────────────────────────────────────────────────────────────────────
//  1. Tormenta de re-entregas — el caso real tras una reconexión por Bad MAC
// ─────────────────────────────────────────────────────────────────────────────
await scenario('dedup-storm', 'Baileys re-entrega 500 mensajes ya procesados', async () => {
  const { alreadyProcessed, dedupStats } = await freshImport('core/dedup.js')

  const ids = Array.from({ length: 500 }, (_, i) => `STORM_${i}`)
  let procesados = 0
  for (const id of ids) if (!alreadyProcessed('main', id)) procesados++
  check('procesa los 500 la primera vez', procesados === 500, `${procesados}/500`)

  let reprocesados = 0
  for (const id of ids) if (!alreadyProcessed('main', id)) reprocesados++
  check('descarta las 500 re-entregas', reprocesados === 0, `${reprocesados} se habrían ejecutado dos veces`)

  const s = dedupStats()
  check('la cuenta de duplicados cuadra', s.duplicates === 500, `${s.duplicates}`)
})

// ─────────────────────────────────────────────────────────────────────────────
//  2. Reinicio a mitad de la tormenta — un Set en memoria fallaría justo acá
// ─────────────────────────────────────────────────────────────────────────────
await scenario('dedup-restart', 'el proceso muere y Baileys re-entrega en el sync', async () => {
  let d = await freshImport('core/dedup.js')
  for (let i = 0; i < 50; i++) d.alreadyProcessed('main', `R_${i}`)
  check('50 mensajes procesados antes del crash', d.dedupStats().seen === 50)

  d = await freshImport('core/dedup.js')   // proceso nuevo
  let colados = 0
  for (let i = 0; i < 50; i++) if (!d.alreadyProcessed('main', `R_${i}`)) colados++
  check('tras reiniciar sigue descartándolos', colados === 0, `${colados} se ejecutarían dos veces`)
  check('un mensaje nuevo sí pasa', d.alreadyProcessed('main', 'R_NUEVO') === false)
})

// ─────────────────────────────────────────────────────────────────────────────
//  3. Aislamiento entre instancias — el bug que casi meto al escribir el dedup
// ─────────────────────────────────────────────────────────────────────────────
await scenario('dedup-subbots', 'un mensaje de grupo llega al bot principal y a 3 sub-bots', async () => {
  const { alreadyProcessed } = await freshImport('core/dedup.js')
  const MSG = 'GRUPO_COMPARTIDO_1'

  const instancias = ['main', '5219999', '5218888', '5217777']
  const atendieron = instancias.filter(b => !alreadyProcessed(b, MSG))
  check('las 4 instancias lo procesan', atendieron.length === 4, `${atendieron.length}/4 respondieron`)

  const reentrega = instancias.filter(b => !alreadyProcessed(b, MSG))
  check('ninguna lo repite en la re-entrega', reentrega.length === 0)
})

// ─────────────────────────────────────────────────────────────────────────────
//  4. Log corrupto — el proceso anterior murió a mitad de una escritura
// ─────────────────────────────────────────────────────────────────────────────
await scenario('dedup-corrupt', 'el log de dedup queda con la cola cortada', async (sandbox) => {
  let d = await freshImport('core/dedup.js')
  for (let i = 0; i < 30; i++) d.alreadyProcessed('main', `C_${i}`)

  const aof = join(sandbox, 'data', 'dedup.aof')
  check('el log existe', existsSync(aof))

  // Basura al final: exactamente lo que deja un crash a mitad de un write.
  appendFileSync(aof, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02]))

  let arranco = true
  try { d = await freshImport('core/dedup.js') } catch { arranco = false }
  check('arranca igual con el log corrupto', arranco)
  if (arranco) {
    check('conserva lo de antes de la corrupción', d.alreadyProcessed('main', 'C_0') === true)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  5. Dependencia caída — cortar, no seguir golpeando
// ─────────────────────────────────────────────────────────────────────────────
await scenario('breaker-down', 'Python deja de responder', async () => {
  const { CircuitBreaker } = await freshImport('lib/circuitBreaker.js')
  const cb = new CircuitBreaker('chaos', { failureThreshold: 3, openMs: 500 })

  for (let i = 0; i < 3; i++) { cb.canAttempt(); cb.recordFailure() }
  check('abre tras 3 fallos seguidos', cb.currentState === 'open', cb.currentState)

  const t0 = process.hrtime.bigint()
  let rechazadas = 0
  for (let i = 0; i < 10_000; i++) if (!cb.canAttempt()) rechazadas++
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  check('rechaza 10.000 llamadas sin tocar la red', rechazadas === 10_000, `${ms.toFixed(1)} ms en total`)

  await sleep(600)
  check('pasado el tiempo deja pasar una de prueba', cb.canAttempt() === true)
  check('y el resto sigue cortado mientras tanto', cb.canAttempt() === false)
  cb.recordSuccess()
  check('si el servicio vuelve, cierra', cb.currentState === 'closed')
})

// ─────────────────────────────────────────────────────────────────────────────
//  6. El servicio contesta pero rechaza — NO debe abrir el circuito
// ─────────────────────────────────────────────────────────────────────────────
await scenario('breaker-429', 'Rust devuelve 429 a propósito (rate limit real)', async () => {
  const srv = createServer((_req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, allowed: false, remaining: 0 }))
  })
  await new Promise(r => srv.listen(19911, r))
  const urlPrevia = { s: process.env.SESSION_API_URL, r: process.env.RUST_API_URL }
  process.env.SESSION_API_URL = 'http://127.0.0.1:19911'
  process.env.RUST_API_URL    = 'http://127.0.0.1:19911'

  try {
    const { sessionClient } = await freshImport('lib/session.js')
    const { rustCircuit }   = await sharedImport('lib/circuitBreaker.js')

    // Se mide el DELTA, no el absoluto. El circuito es compartido y llega con
    // los trips de los escenarios anteriores; la afirmación que importa es que
    // estas 30 llamadas no suman ninguno, no que el contador global esté a
    // cero. Antes se comprobaba sobre una copia recién importada del módulo,
    // que siempre daba 0 trips y 'closed' sin haber hecho nada.
    rustCircuit.reset()
    const tripsAntes = rustCircuit.stats().trips

    for (let i = 0; i < 30; i++) await sessionClient.checkRate('flood@s.whatsapp.net').catch(() => {})
    check('30 bloqueos NO abren el circuito', rustCircuit.currentState === 'closed', rustCircuit.currentState)
    check('el rate limiter sigue operativo', rustCircuit.stats().trips === tripsAntes,
      `trips ${tripsAntes} → ${rustCircuit.stats().trips}`)
  } finally {
    srv.close()
    // Hay que dejar las cosas como estaban, y no por prolijidad: el poller de
    // salud de session.js sigue vivo apuntando al 19911, que acaba de morir.
    // Esos fallos son reales y abrían el circuito [rust] DESPUÉS de este
    // escenario — el de outbox, que corre luego, se encontraba el circuito
    // abierto y fallaba por algo que no tenía nada que ver con el outbox.
    //
    // freshImport() invalida la caché del módulo que se le pide, pero no la de
    // sus dependencias: circuitBreaker.js es el MISMO objeto en los 8
    // escenarios, así que el estado se arrastra entre ellos.
    process.env.SESSION_API_URL = urlPrevia.s
    process.env.RUST_API_URL    = urlPrevia.r
    const { rustCircuit } = await sharedImport('lib/circuitBreaker.js')
    rustCircuit.reset()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  7. Avalancha — el caso que de verdad tumba el bot
// ─────────────────────────────────────────────────────────────────────────────
await scenario('shedding-flood', 'el event loop se bloquea bajo una avalancha', async () => {
  const ls = await freshImport('core/loadShedding.js')
  await sleep(2500)   // el histograma tiene que arrancar antes de poder medir

  check('en reposo no se descarta nada', ['critical', 'high', 'normal', 'low'].every(p => !ls.shouldShed(p)))

  const end = Date.now() + 1800
  while (Date.now() < end) { Math.sqrt(Math.random()) }   // bloqueo real
  await sleep(2200)

  const nivel = ls.loadLevel()
  check('detecta la saturación', nivel !== 'normal', `nivel ${nivel} · lag ${ls.loadStats().lagAtLevelMs} ms`)
  check('MODERACIÓN sigue pasando', ls.shouldShed('critical') === false)
  check('administración sigue pasando', ls.shouldShed('high') === false)
  check('lo prescindible se descarta', ls.shouldShed('low') === true)
})

// ─────────────────────────────────────────────────────────────────────────────
//  8. Crash entre "cobrar" y "avisar" — el escenario que motivó el outbox
// ─────────────────────────────────────────────────────────────────────────────
await scenario('outbox-crash', 'muere tras mover el dinero, antes de confirmar', async () => {
  if (!process.env.CHAOS_RUST_URL) {
    console.log(`     ${color.yellow('--')} ${color.dim('omitido: necesita la API de Rust (CHAOS_RUST_URL=http://127.0.0.1:puerto)')}`)
    return
  }
  // Cada escenario anterior dejó su propio sessionClient con su poller de
  // salud apuntando a un servidor que ya no existe, y todos comparten este
  // circuito. Empezar con él cerrado es parte de montar el escenario, no una
  // concesión: lo que se quiere probar acá es el outbox, no el breaker.
  const { rustCircuit }   = await sharedImport('lib/circuitBreaker.js')
  rustCircuit.reset()
  const { sessionClient } = await freshImport('lib/session.js')

  const id = `CHAOS_${Date.now()}`
  await sessionClient.enqueueOutbox([{ id, jid: '1@g.us', payload: JSON.stringify({ text: 'pago confirmado' }) }])

  // Aquí muere el proceso: encolado, pero nunca enviado.
  const pend = await sessionClient.outboxUnsent(100, 3)
  const mio  = pend.find(m => m.id === id)
  check('el mensaje sobrevive al crash', !!mio)
  check('con su contenido para poder reenviarlo', mio?.payload?.includes('pago') === true)

  await sessionClient.bumpOutboxRetry([id])
  const tras1 = (await sessionClient.outboxUnsent(100, 3)).find(m => m.id === id)
  check('el contador de reintentos sube', tras1?.retry_count === 1, `retry=${tras1?.retry_count}`)

  await sessionClient.markOutboxSent([id])
  const tras2 = (await sessionClient.outboxUnsent(100, 3)).find(m => m.id === id)
  check('tras reenviarlo sale de la cola', !tras2)
})

// ─────────────────────────────────────────────────────────────────────────────
//  9. Un mensaje, una fila — el invariante que motivó unificar el almacén
// ─────────────────────────────────────────────────────────────────────────────
await scenario('corpus-unico', 'el mensaje se guarda una sola vez y en un solo sitio', async () => {
  if (!process.env.CHAOS_RUST_URL) {
    console.log(`     ${color.yellow('--')} ${color.dim('omitido: necesita la API de Rust (CHAOS_RUST_URL=http://127.0.0.1:puerto)')}`)
    return
  }

  const url = process.env.SESSION_API_URL
  const key = process.env.SESSION_API_KEY ?? ''
  const api = async (ruta, init = {}) => {
    const r = await fetch(`${url}${ruta}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-api-key': key, ...(init.headers ?? {}) },
    })
    return r.json()
  }

  // Un JID propio del escenario: así se puede contar sin que lo ensucie nada
  // de lo que haya en la base, y se borra al final.
  const jid  = `chaos-corpus-${Date.now()}@s.whatsapp.net`
  const gjid = `chaos-corpus-${Date.now()}@g.us`

  const antes = (await api('/ai/corpus/stats')).rows

  // 5 mensajes sueltos de grupo (lo que antes iba a Python → Parquet) …
  for (let i = 0; i < 5; i++) {
    await api('/ai/observe', { method: 'POST',
      body: JSON.stringify({ sender: jid, gjid, text: `mensaje de prueba numero ${i} jaja causa` }) })
  }
  // … y un intercambio con la IA (lo que ya iba a Rust).
  await api('/ai/learn', { method: 'POST', body: JSON.stringify({
    sender: jid, gjid, text: 'hola bot', intent: 'saludo', reply: 'que tal', mode: 'amable' }) })

  const perfil = await api(`/ai/profile/${encodeURIComponent(jid)}`)
  check('los 6 mensajes están, sin duplicar', perfil.msg_count === 6, `msg_count=${perfil.msg_count}`)

  const despues = (await api('/ai/corpus/stats')).rows
  check('el corpus creció en 6, no en 12', despues - antes === 6, `+${despues - antes} filas`)

  // Lo que separa los dos usos del mismo almacén: las observaciones alimentan
  // el perfil de estilo, pero NO son historial para armar el prompt — serían
  // pares pregunta/respuesta con la respuesta vacía.
  const ctx = await api(`/ai/context/${encodeURIComponent(jid)}`)
  check('el historial trae solo el intercambio real', ctx.history?.length === 1, `${ctx.history?.length} turnos`)
  check('y con la respuesta del bot', ctx.history?.[0]?.reply === 'que tal')

  check('la jerga se detecta', perfil.uses_slang === true)
  check('el estilo del grupo sale del mismo sitio',
    (await api(`/ai/group-style/${encodeURIComponent(gjid)}`)).msg_count === 6)

  // Privacidad: tiene que irse TODO, de las dos tablas.
  const borrado = await api(`/ai/profile/${encodeURIComponent(jid)}`, { method: 'DELETE' })
  check('el borrado se lleva las 6 filas y el perfil', borrado.deleted_rows === 7, `${borrado.deleted_rows} filas`)
  check('y el corpus vuelve a como estaba', (await api('/ai/corpus/stats')).rows === antes)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Resumen
// ─────────────────────────────────────────────────────────────────────────────
const fallos = results.filter(r => !r.ok)
console.log()
if (fallos.length) {
  console.log(`  ${color.bold(color.red('FALLÓ'))}  ${results.length - fallos.length}/${results.length} comprobaciones OK`)
  for (const f of fallos) console.log(`    ${color.red('XX')} ${f.label}`)
} else {
  console.log(`  ${color.bold(color.green('TODO OK'))}  ${results.length}/${results.length} comprobaciones`)
}
console.log()
process.exit(fallos.length ? 1 : 0)
