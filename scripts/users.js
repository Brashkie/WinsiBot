#!/usr/bin/env node
// npm run users:export / users:import — leer y restaurar el padrón de usuarios.
// Con --grupos, lo mismo para data/groups.aof (npm run groups:export / import / stats).
//
// data/users.aof es un log append-only de strenor, no un JSON que se pueda
// abrir con un editor. Este script es la vía para mirar los datos, hacerte un
// respaldo legible, o restaurar desde uno (incluido data/users.json.migrated,
// el users.json original que dejó la migración).
//
// IMPORTANTE: strenor es in-process. Dos procesos escribiendo el mismo log a
// la vez lo corrompen, así que 'import' exige que el bot esté parado. 'export'
// solo lee, pero con el bot corriendo puede darte una foto a medio escribir.

import { existsSync, statSync } from 'fs'
import { writeFile, readFile } from 'fs/promises'
import { createInterface } from 'readline'
import { Strenor } from 'strenor'
import { color } from 'ansimax'

const GRUPOS = process.argv.includes('--grupos')
const AOF    = GRUPOS ? './data/groups.aof' : './data/users.aof'
const PREFIX = GRUPOS ? 'group:' : 'user:'
const QUE    = GRUPOS ? 'grupos' : 'usuarios'
const BAK    = GRUPOS ? './data/groups.json.migrated' : './data/users.json.migrated'

const [cmd, file] = process.argv.slice(2).filter(a => a !== '--grupos')

const die = (msg) => { console.error(color.red(`✗ ${msg}`)); process.exit(1) }
const ok  = (msg) => console.log(color.green(`✓ ${msg}`))

function open() {
  if (!existsSync(AOF)) die(`no existe ${AOF} — ¿el bot llegó a arrancar alguna vez?`)
  return new Strenor({ aof: AOF })
}

function readAll(store) {
  const out = {}
  for (const key of store.keys()) {
    if (!key.startsWith(PREFIX)) continue
    const json = store.getString(key)
    if (json) out[key.slice(PREFIX.length)] = JSON.parse(json)
  }
  return out
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise(r => rl.question(`${question} (escribí "si") `, r))
  rl.close()
  return answer.trim().toLowerCase() === 'si'
}

switch (cmd) {
  case 'export': {
    const dest  = file ?? `./data/${GRUPOS ? 'groups' : 'users'}.export.${new Date().toISOString().slice(0, 10)}.json`
    const store = open()
    const users = readAll(store)
    await writeFile(dest, JSON.stringify(users, null, 2), 'utf-8')
    store.close()
    ok(`${Object.keys(users).length} ${QUE} exportados → ${dest}`)
    break
  }

  case 'import': {
    if (!file)             die(`falta el archivo — uso: node scripts/users.js import ${BAK}${GRUPOS ? ' --grupos' : ''}`)
    if (!existsSync(file)) die(`no existe ${file}`)

    const raw   = JSON.parse(await readFile(file, 'utf-8'))
    const jids  = Object.keys(raw)
    if (jids.length === 0) die(`el archivo no tiene ${QUE}`)

    const store   = open()
    const actuales = Object.keys(readAll(store)).length

    console.log(color.yellow('\n⚠  El bot tiene que estar PARADO — si está corriendo, los dos procesos'))
    console.log(color.yellow('   escribirían el mismo log a la vez y lo dejarían corrupto.\n'))
    console.log(`   archivo:  ${file} → ${jids.length} ${QUE}`)
    console.log(`   log ahora: ${AOF} → ${actuales} ${QUE}`)
    console.log(color.dim(`   Los ${QUE} del archivo pisan a los del log; el resto queda intacto.\n`))

    if (!await confirm('¿Seguimos?')) { store.close(); die('cancelado') }

    store.batch(() => {
      for (const [jid, data] of Object.entries(raw)) {
        store.setString(`${PREFIX}${jid}`, JSON.stringify(data))
      }
    })
    store.compact()
    store.close()
    ok(`${jids.length} ${QUE} importados a ${AOF}`)
    break
  }

  case 'stats': {
    const store = open()
    const users = readAll(store)
    const bytes = statSync(AOF).size
    store.close()
    console.log(`\n  ${QUE} en el log : ${Object.keys(users).length}`)
    console.log(`  tamaño del log     : ${(bytes / 1024 / 1024).toFixed(2)} MB`)
    console.log(`  respaldo migración : ${existsSync(BAK) ? 'sí' : 'no'}\n`)
    break
  }

  default:
    console.log(`
  ${color.bold('Padrón de usuarios')} — data/users.aof  (con --grupos: data/groups.aof)

    node scripts/users.js export [archivo]   respaldo legible (por defecto data/users.export.<fecha>.json)
    node scripts/users.js import <archivo>   restaurar desde un JSON (con el bot parado)
    node scripts/users.js stats              cuántos usuarios y cuánto ocupa el log
`)
}
