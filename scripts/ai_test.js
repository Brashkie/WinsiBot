#!/usr/bin/env node
// npm run ai:test — prueba el clasificador de intenciones contra Rust.
//
// Antes esto comparaba Rust contra ai/intent_classifier.py y salía con error si
// Python no respondía. Ya no tiene sentido: desde la 8.11.0 la clasificación la
// resuelve Rust entera (`/nlp/fast`, reglas, sub-milisegundo) y el paso por
// Python se quitó — no porque sobrara, sino porque era PEOR que no tener
// respaldo: el vocabulario de ml/nlp.py era saludo/despedida/ayuda/gracias/
// insulto/pregunta, así que nunca podía devolver las etiquetas contra las que
// comparan los consumidores (insult, nsfw, spam, nonsense), pero sí devolvía un
// objeto válido, y eso hacía que la regex local de respaldo no se evaluara
// nunca. Ver el comentario de analyzeIntent en src/lib/pythonBridge.ts.
//
// De paso quedó a la vista que el proyecto tenía DOS clasificadores en Python y
// el bot llamaba al equivocado: ai/intent_classifier.py sí usa el vocabulario
// correcto, pero ningún punto del bot lo llamaba.

import 'dotenv/config'
import { ascii, color, themes } from 'ansimax'

const RUST_URL = process.env.SESSION_API_URL ?? process.env.RUST_API_URL ?? 'http://127.0.0.1:18080'
const RUST_KEY = process.env.SESSION_API_KEY ?? process.env.RUST_API_KEY ?? ''

// Los casos cubren las tres cosas que importan: que detecte lo que debe, que la
// prioridad del pipeline sea la correcta, y que NO castigue texto inocente.
const CASES = [
  // ── lo básico ──────────────────────────────────────────────────────────────
  { text: 'hola como estas',           expect: 'greeting' },
  { text: 'buenas',                    expect: 'greeting' },
  { text: 'chau',                      expect: 'farewell' },
  { text: 'adios hasta luego',         expect: 'farewell' },
  { text: '.sticker enviar imagen',    expect: 'command_attempt' },
  { text: '!help comandos bot',        expect: 'command_attempt' },
  { text: 'holaaaaaaaaa',              expect: 'spam' },
  { text: 'aaaaaaaaaaaaaa',            expect: 'spam' },
  { text: 'xxx hentai',                expect: 'nsfw' },
  { text: 'estupido idiota',           expect: 'insult' },

  // ── los que antes quedaban sin moderar ────────────────────────────────────
  // Estaban en la regex local de TypeScript pero no en la de Rust, y por el
  // respaldo de Python la regex local nunca se llegaba a evaluar.
  { text: 'imbecil',                   expect: 'insult' },
  { text: 'hijueputa',                 expect: 'insult' },
  { text: 'mamahuevo',                 expect: 'insult' },
  { text: 'coño',                      expect: 'insult' },
  { text: 'motherfucker',              expect: 'insult' },
  { text: 'mandame nudes',             expect: 'nsfw' },
  { text: 'busca onlyfans',            expect: 'nsfw' },
  { text: 'porno',                     expect: 'nsfw' },
  { text: 'desnuda',                   expect: 'nsfw' },

  // ── prioridad del pipeline ────────────────────────────────────────────────
  // El comando gana al insulto: si no, moderación lo trataría como ofensa y el
  // comando no se ejecutaría.
  { text: '#ban idiota',               expect: 'command_attempt' },
  // El insulto gana al nsfw: la consecuencia es más dura y no debe quedar tapada.
  { text: 'idiota mandame nudes',      expect: 'insult' },

  // ── que NO castigue texto inocente ────────────────────────────────────────
  { text: 'llegue en el sexto puesto de la tabla',  expect: 'unknown' },
  { text: 'mañana jugamos el partido en la cancha', expect: 'unknown' },
  { text: 'desnud',                                 expect: 'unknown' },
]

async function clasificar(text) {
  const t0 = performance.now()
  const r  = await fetch(`${RUST_URL}/nlp/fast`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': RUST_KEY },
    body:    JSON.stringify({ text }),
    signal:  AbortSignal.timeout(2_000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  return { intent: d.intent, confidence: d.confidence, us: (performance.now() - t0) * 1000 }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n  ${color.bold('WinsiBot — clasificador de intenciones')}  ${color.dim(RUST_URL)}\n`)

try {
  await clasificar('hola')
} catch (err) {
  console.error(`  ${themes.error('La API de Rust no responde')} ${color.dim(String(err.message))}`)
  console.error(`  ${color.dim('Levantala con `npm run rust:build && cd rust && cargo run --release`, o corre el bot.')}\n`)
  process.exit(1)
}

let ok = 0
const fallos = []
const tiempos = []

for (const c of CASES) {
  const r      = await clasificar(c.text)
  const pasa   = r.intent === c.expect
  const marca  = pasa ? color.green('OK') : color.red('XX')
  tiempos.push(r.us)
  if (pasa) ok++
  else fallos.push({ ...c, got: r.intent })

  const detalle = pasa
    ? color.dim(`${c.expect}  ${r.confidence}`)
    : color.red(`esperaba ${c.expect}, dio ${r.intent}`)
  console.log(`  [${marca}] ${c.text.padEnd(42)} ${detalle}`)
}

// La latencia incluye el round-trip HTTP, que es lo que domina: el trabajo de
// clasificar son unos microsegundos. Vale como techo, no como medida del
// algoritmo — para eso está `npm run rust:test` y los benchmarks de Criterion.
const media = tiempos.reduce((a, b) => a + b, 0) / tiempos.length
console.log(`\n  ${ok === CASES.length ? themes.success(`TODO OK  ${ok}/${CASES.length}`) : themes.error(`FALLÓ  ${ok}/${CASES.length}`)}`)
console.log(`  ${color.dim(`round-trip HTTP medio: ${(media / 1000).toFixed(2)} ms (incluye la red, no solo el clasificado)`)}\n`)

if (fallos.length) {
  for (const f of fallos) console.log(`    ${color.red('XX')} ${f.text} — esperaba ${f.expect}, dio ${f.got}`)
  console.log()
  process.exit(1)
}
