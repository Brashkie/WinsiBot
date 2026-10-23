import fg from 'fast-glob'
import { existsSync, readFileSync } from 'fs'
import { pathToFileURL, fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { Command } from '../../types/index.js'
import { logger } from '@core/logger.js'

export const commandRegistry = new Map<string, Command>()

function registrar(command: Command): void {
  commandRegistry.set(command.name, command)
  for (const alias of command.aliases ?? []) commandRegistry.set(alias, command)
}

function comandosDe(mod: any): Command[] {
  const exported = mod.default ?? mod.command
  // soporta tanto default = Command como default = Command[]
  return Array.isArray(exported) ? exported : exported ? [exported] : []
}

/**
 * Registra los comandos.
 *
 * Con `dist/plugins/commands/manifest.json` —lo genera `npm run build`— NO
 * importa ninguno: registra sus datos (nombre, alias, categoría, cooldown...)
 * y cada comando se importa la primera vez que alguien lo usa. Importarlos
 * todos al arrancar costaba **29 MB de RAM y ~0,4 s**, medido con
 * `npm run mem:profile`, por ~195 comandos de los que una sesión usa unos
 * pocos. Los menús y los middlewares solo leen datos, así que ven lo mismo.
 *
 * Sin manifiesto —`npm run dev`, que corre desde src/ con tsx— los importa
 * todos, como antes.
 */
export async function loadCommands(): Promise<void> {
  // Funciona tanto en src/ (tsx) como en dist/ (node)
  const base = dirname(fileURLToPath(import.meta.url))
  const manifiesto = join(base, 'manifest.json')

  if (existsSync(manifiesto) && !import.meta.url.endsWith('.ts')) {
    registrarPerezosos(base, JSON.parse(readFileSync(manifiesto, 'utf8')).comandos)
  } else {
    await importarTodos(base)
  }

  // commandRegistry.size cuenta name+aliases por separado (un comando con 3
  // alias son 4 entradas) — deduplicar por objeto para loguear el número real
  // de comandos originales, no de claves de resolución.
  const uniqueCount = new Set(commandRegistry.values()).size
  logger.info(`✅ ${uniqueCount} comandos cargados (${commandRegistry.size} entradas con alias)`)
}

async function importarTodos(base: string): Promise<void> {
  const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const files = await fg(`**/*.${ext}`, {
    cwd:      base,
    ignore:   [`**/index.${ext}`, '**/*.d.ts'],
    absolute: true,
  })
  for (const file of files) {
    try {
      for (const command of comandosDe(await import(pathToFileURL(file).href))) {
        if (!command?.name) continue
        registrar(command)
        logger.debug(`Comando cargado: ${command.name}`)
      }
    } catch (err) {
      logger.error({ err, file }, 'Error cargando comando')
    }
  }
}

type Entrada = Omit<Command, 'execute'> & { file: string }

/** Un módulo por archivo, importado una sola vez aunque lo pidan varios a la vez. */
const modulos = new Map<string, Promise<Command[]>>()

function registrarPerezosos(base: string, entradas: Entrada[]): void {
  for (const { file, ...datos } of entradas) {
    const ruta = pathToFileURL(join(base, file)).href
    const perezoso: Command = {
      ...(datos as Omit<Command, 'execute'>),
      async execute(ctx) {
        let p = modulos.get(ruta)
        if (!p) {
          p = import(ruta).then(comandosDe)
          modulos.set(ruta, p)
          // Un import fallido no se recuerda: el próximo uso lo reintenta.
          p.catch(() => modulos.delete(ruta))
        }
        const real = (await p).find((c) => c?.name === datos.name)
        if (!real) throw new Error(`el comando ${datos.name} no está en ${file}: hace falta npm run build`)
        // De acá en adelante el registro apunta al comando real, con todos sus
        // campos, y las llamadas siguientes no pasan por acá.
        if (commandRegistry.get(datos.name) === perezoso) registrar(real)
        return real.execute(ctx)
      },
    }
    registrar(perezoso)
  }
}
