#!/usr/bin/env node
// npm run ai:test — prueba el clasificador de intents con casos reales

import { spawnSync } from 'child_process'
import { join }      from 'path'

const WIN    = process.platform === 'win32'
const PYTHON = join(process.cwd(), 'python', 'venv', WIN ? 'Scripts/python.exe' : 'bin/python')
const CWD    = join(process.cwd(), 'python')

const CASES = [
  { text: 'hola como estas',          expect: 'greeting' },
  { text: 'buen dia amigo',           expect: 'greeting' },
  { text: 'compra seguidores ya!!!',   expect: 'spam' },
  { text: 'gana dinero rapido click', expect: 'spam' },
  { text: 'estupido imbecil idiota',  expect: 'insult' },
  { text: 'maldito inutil te odio',   expect: 'insult' },
  { text: 'xxx hentai 18+',           expect: 'nsfw' },
  { text: '.sticker enviar imagen',   expect: 'command_attempt' },
  { text: '!help comandos bot',       expect: 'command_attempt' },
  { text: 'adios hasta luego',        expect: 'farewell' },
  { text: 'aaaaaaaaaaaaaa kk',        expect: 'nonsense' },
]

// Rust fast-path test via HTTP
async function rustTest(text) {
  try {
    const t0 = Date.now()
    const r  = await fetch('http://127.0.0.1:3001/nlp/fast', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
      signal:  AbortSignal.timeout(500),
    })
    if (!r.ok) return null
    const d = await r.json()
    return { intent: d.intent, confidence: d.confidence, method: 'rust', ms: Date.now() - t0 }
  } catch {
    return null
  }
}

// Python classifier test
function pythonTest(cases) {
  const code = `
import sys, json, time
sys.path.insert(0, '.')
from ai.intent_classifier import classify

cases = ${JSON.stringify(cases)}
out   = []
for c in cases:
    t0 = time.time()
    r  = classify(c['text'])
    ms = round((time.time() - t0) * 1000, 1)
    out.append({ 'text': c['text'], 'expect': c['expect'], 'intent': r.intent, 'conf': round(r.confidence, 2), 'method': r.method, 'ms': ms })
print(json.dumps(out))
`
  const r = spawnSync(PYTHON, ['-c', code], { cwd: CWD, encoding: 'utf8', timeout: 15_000 })
  if (r.status !== 0) {
    console.error('Python error:', r.stderr?.slice(0, 300))
    return null
  }
  try { return JSON.parse(r.stdout) } catch { return null }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('\n  WinsiBot — AI Intent Classifier Test')
console.log('  ──────────────────────────────────────────────────\n')

// Check Rust
const rustPing = await rustTest('hola')
console.log(`  Rust NLP: ${rustPing ? `🟢 Online (${rustPing.ms}ms)` : '🔴 Offline — solo Python'}`)

// Run Python tests
const results = pythonTest(CASES)
if (!results) {
  console.error('\n  ERROR: No se pudo conectar con el clasificador Python.\n')
  process.exit(1)
}

// Also run Rust tests in parallel
const rustResults = await Promise.all(
  CASES.map(c => rustTest(c.text))
)

let passed = 0
let rustPassed = 0

console.log('\n  Texto                          Esperado         Python           Rust')
console.log('  ─────────────────────────────────────────────────────────────────────')

for (let i = 0; i < results.length; i++) {
  const p  = results[i]
  const rr = rustResults[i]
  const pyOk   = p.intent === p.expect
  const rustOk = rr ? rr.intent === p.expect : null

  if (pyOk) passed++
  if (rustOk) rustPassed++

  const pyIcon   = pyOk ? '✅' : '❌'
  const rustIcon = rr ? (rustOk ? '✅' : '❌') : '—'

  const txt    = p.text.slice(0, 28).padEnd(29)
  const exp    = p.expect.padEnd(16)
  const pyOut  = `${pyIcon} ${p.intent.padEnd(14)} (${p.ms}ms)`
  const rOut   = rr ? `${rustIcon} ${rr.intent.padEnd(14)} (${rr.ms}ms)` : '  offline'

  console.log(`  ${txt}  ${exp}  ${pyOut}  ${rOut}`)
}

console.log('\n  ─────────────────────────────────────────────────────────────────────')
console.log(`  Python  ${passed}/${results.length} correctos`)
if (rustPing) console.log(`  Rust    ${rustPassed}/${results.length} correctos`)
console.log()
