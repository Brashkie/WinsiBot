#!/usr/bin/env node
// Genera dist/plugins/commands/manifest.json: los datos de cada comando
// —nombre, alias, categoría, descripción, cooldown...— sin su código.
//
// Corre al final de `npm run build`. Con el manifiesto, el bot registra los
// ~195 comandos al arrancar SIN importarlos, y cada uno se importa la primera
// vez que alguien lo usa (ver loadCommands en src/plugins/commands/index.ts).
// Importarlos todos al arrancar costaba 29 MB de RAM y ~0,4 s, medido con
// `npm run mem:profile`, aunque la mayoría no se use nunca en una sesión.
//
// Se guardan TODOS los campos que no son funciones, no una lista fija: los
// menús, la ayuda y los middlewares leen campos del comando, y una lista fija
// se quedaría corta el día que un comando agregue uno nuevo.

import { writeFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { pathToFileURL } from 'url'

const BASE = join(process.cwd(), 'dist', 'plugins', 'commands')
const files = readdirSync(BASE, { recursive: true })
  .filter(f => f.endsWith('.js') && f !== 'index.js')
  .map(f => join(BASE, f))

const datos = (cmd) => {
  const out = {}
  for (const [k, v] of Object.entries(cmd)) {
    if (typeof v === 'function') continue
    try {
      out[k] = JSON.parse(JSON.stringify(v))
    } catch {
      // Algo no serializable: se deja fuera, y el comando real lo tendrá al cargarse.
    }
  }
  return out
}

const entradas = []
let fallidos = 0
for (const file of files) {
  try {
    const mod = await import(pathToFileURL(file).href)
    const exp = mod.default ?? mod.command
    const lista = Array.isArray(exp) ? exp : exp ? [exp] : []
    for (const cmd of lista) {
      if (!cmd?.name || typeof cmd.execute !== 'function') continue
      entradas.push({ file: relative(BASE, file).replace(/\\/g, '/'), ...datos(cmd) })
    }
  } catch (err) {
    fallidos++
    console.error(`  ✗ manifiesto: no se pudo importar ${relative(BASE, file)}: ${err.message}`)
  }
}

writeFileSync(join(BASE, 'manifest.json'), JSON.stringify({ version: 1, comandos: entradas }))
console.log(`  ✔ manifiesto de comandos: ${entradas.length} comandos${fallidos ? `, ${fallidos} archivos con error` : ''}`)
// Algún comando deja temporizadores al importarse; el script no tiene por qué
// esperarlos.
process.exit(fallidos ? 1 : 0)
