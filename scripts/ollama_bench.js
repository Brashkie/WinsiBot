#!/usr/bin/env node
// npm run ai:bench — cuánto cuesta que Ollama tenga el modelo frío.
//
// El camino de una respuesta de IA está dominado por Ollama: el lado de Rust
// aporta ~1,4 ms armando el prompt y buscando los perfiles, y Ollama tarda
// segundos. Pero "segundos" tapa dos cosas muy distintas:
//
//   caliente  el modelo ya está en RAM/VRAM  →  solo genera
//   frío      hay que leerlo del disco otra vez  →  carga + genera
//
// Y acá está el detalle que motiva este script: **Ollama descarga el modelo a
// los 5 minutos de inactividad**, por defecto. Un bot de WhatsApp recibe
// mensajes a la IA de forma esporádica, así que muchas peticiones —puede que
// la mayoría— están pagando la recarga entera sin que eso aparezca en ningún
// log. `ai_chat.rs` no manda `keep_alive` en ninguna llamada.
//
// Si la diferencia que mide esto es de segundos, el arreglo más grande de la
// latencia de la IA no está en ningún kernel ni en ningún lenguaje: está en
// que el modelo no se descargue.
//
// De paso contesta una pregunta que no se puede dar por sabida: si el endpoint
// compatible con OpenAI —que es el que usa el bot— respeta `keep_alive`, o si
// hay que pasarse al nativo `/api/chat` para controlarlo.

import './env.js'
import { color } from 'ansimax'

const URL    = process.env.OLLAMA_URL   ?? 'http://localhost:11434'
const MODELO = process.env.OLLAMA_MODEL ?? 'llama3.2:3b'

// El mismo endpoint que usa ai_chat.rs, no el nativo: medir otro sería medir
// algo que el bot no ejecuta.
const CHAT = `${URL}/v1/chat/completions`

// Un prompt parecido al que arma `construir_prompt()`: system con personalidad
// y un mensaje corto de usuario. El tamaño importa, porque el prefill escala
// con él.
const SYSTEM = [
  'Eres WinsiBot, la IA de un bot de WhatsApp en un grupo.',
  'Tu personalidad es: amable y servicial, respondes corto.',
  'Responde en una o dos frases, en español, sin emojis.',
].join('\n')
const USUARIO = 'hola, como estas?'

const VUELTAS_CALIENTE = 3

const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6

function mediana(xs) {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function json(url, init, timeoutMs = 180_000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`)
  return r.json()
}

/** Los modelos que Ollama tiene cargados en memoria ahora mismo. */
async function cargados() {
  try {
    const j = await json(`${URL}/api/ps`, {}, 10_000)
    return (j.models ?? []).map(m => m.name)
  } catch {
    return []
  }
}

/** Saca el modelo de memoria. `keep_alive: 0` en el endpoint NATIVO siempre lo respeta. */
async function descargar() {
  await json(`${URL}/api/generate`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ model: MODELO, prompt: '', keep_alive: 0 }),
  }, 60_000)

  // La descarga no es instantánea: se espera a que /api/ps lo deje de listar.
  for (let i = 0; i < 40; i++) {
    if (!(await cargados()).some(n => n.startsWith(MODELO.split(':')[0]))) return true
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

/** Una petición igual a la que hace el bot. Devuelve los ms y los tokens generados. */
async function pedir(extra = {}) {
  const t0 = process.hrtime.bigint()
  const j  = await json(CHAT, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({
      model:       MODELO,
      messages:    [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: USUARIO },
      ],
      temperature: 0.85,
      max_tokens:  300,
      stream:      false,
      ...extra,
    }),
  })
  return { ms: ms(t0), tokens: j.usage?.completion_tokens ?? null }
}

const linea = (etiqueta, valor) => console.log(`    ${etiqueta.padEnd(34)}${valor}`)

async function main() {
  console.log(`\n  ${color.bold('Ollama: frío contra caliente')}  ${color.dim(`${MODELO} · ${URL}`)}\n`)

  // ── Está vivo y tiene el modelo ────────────────────────────────────────────
  let tags
  try {
    tags = await json(`${URL}/api/tags`, {}, 10_000)
  } catch (e) {
    console.error(`  ${color.red('✗')} Ollama no responde en ${URL} — ${e.message}`)
    console.error(`    Arrancalo con ${color.bold('ollama serve')} y volvé a correr esto.\n`)
    process.exit(1)
  }

  const instalados = (tags.models ?? []).map(m => m.name)
  if (!instalados.includes(MODELO)) {
    console.error(`  ${color.red('✗')} El modelo ${color.bold(MODELO)} no está instalado.`)
    console.error(`    Bajalo con ${color.bold(`ollama pull ${MODELO}`)}`)
    console.error(`    Instalados: ${instalados.join(', ') || '(ninguno)'}\n`)
    process.exit(1)
  }

  // ── Caliente ───────────────────────────────────────────────────────────────
  // Una petición de descarte primero: carga el modelo y deja el sistema en el
  // estado que se quiere medir.
  console.log(`  ${color.dim('calentando...')}`)
  await pedir()

  const calientes = []
  for (let i = 0; i < VUELTAS_CALIENTE; i++) calientes.push((await pedir()).ms)
  const caliente = mediana(calientes)

  // ── Frío ───────────────────────────────────────────────────────────────────
  console.log(`  ${color.dim('descargando el modelo de memoria...')}`)
  const fuera = await descargar()
  if (!fuera) {
    console.log(`  ${color.yellow('⚠')} El modelo sigue en memoria; la medición en frío no sería real.\n`)
    process.exit(1)
  }

  const { ms: frio, tokens } = await pedir()

  // ── ¿El endpoint de OpenAI respeta keep_alive? ─────────────────────────────
  // No se puede dar por sabido: `keep_alive` es de la API nativa de Ollama, y
  // /v1/chat/completions imita a OpenAI, que no tiene ese concepto. Si lo
  // respeta, mandarlo desde ai_chat.rs alcanza; si no, hay que resolverlo del
  // lado del servidor con OLLAMA_KEEP_ALIVE.
  await pedir({ keep_alive: 0 })
  await new Promise(r => setTimeout(r, 2_000))
  const siguePuesto = (await cargados()).some(n => n.startsWith(MODELO.split(':')[0]))
  const respeta = !siguePuesto

  // ── Resultado ──────────────────────────────────────────────────────────────
  const dif   = frio - caliente
  const veces = frio / caliente

  console.log()
  linea('caliente (mediana de ' + VUELTAS_CALIENTE + ')', `${color.green(caliente.toFixed(0).padStart(7))} ms`)
  linea('frío (modelo descargado)',                        `${color.red(frio.toFixed(0).padStart(7))} ms`)
  console.log(`    ${'-'.repeat(46)}`)
  linea('lo que cuesta la recarga',                        `${color.bold(dif.toFixed(0).padStart(7))} ms   (${veces.toFixed(1)}x)`)
  if (tokens) linea('tokens generados', String(tokens).padStart(7))

  console.log()
  if (dif > 1_000) {
    console.log(`  ${color.yellow(color.bold('→ La recarga cuesta más de un segundo.'))}`)
    console.log(`    Ollama descarga el modelo a los 5 min de inactividad, así que en un`)
    console.log(`    grupo con mensajes espaciados esto se paga seguido, en silencio.`)
  } else {
    console.log(`  ${color.green('→ La recarga es barata acá.')} Con este modelo y este disco no es`)
    console.log(`    el cuello de botella; el tiempo se va en generar.`)
  }

  console.log()
  console.log(`  ${color.bold('¿/v1/chat/completions respeta keep_alive?')}  ${respeta ? color.green('sí') : color.yellow('no')}`)
  if (respeta) {
    console.log(`    Alcanza con mandar "keep_alive": -1 desde ai_chat.rs.`)
  } else {
    console.log(`    Hay que resolverlo del lado del servidor:`)
    console.log(`      ${color.bold('OLLAMA_KEEP_ALIVE=-1')}   (en el entorno de Ollama, no en el .env del bot)`)
    console.log(`    o pasar las llamadas al endpoint nativo /api/chat.`)
  }
  console.log()
}

main().catch((e) => {
  console.error(`\n  ${color.red('✗')} ${e.message}\n`)
  process.exit(1)
})
