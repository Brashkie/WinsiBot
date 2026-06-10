import fg from 'fast-glob'
import { pathToFileURL, fileURLToPath } from 'url'
import { dirname } from 'path'
import type { Command } from '../../types/index.js'
import { logger } from '@core/logger.js'

export const commandRegistry = new Map<string, Command>()

export async function loadCommands(): Promise<void> {
  // Funciona tanto en src/ (tsx) como en dist/ (node)
  const base = dirname(fileURLToPath(import.meta.url))
  const ext  = import.meta.url.endsWith('.ts') ? 'ts' : 'js'

  const files = await fg(`**/*.${ext}`, {
    cwd:      base,
    ignore:   [`**/index.${ext}`, '**/*.d.ts'],
    absolute: true,
  })

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(file).href)
      const exported = mod.default ?? mod.command

      // soporta tanto default = Command como default = Command[]
      const commands: Command[] = Array.isArray(exported) ? exported : exported ? [exported] : []

      for (const command of commands) {
        if (!command?.name) continue
        commandRegistry.set(command.name, command)
        for (const alias of command.aliases ?? []) {
          commandRegistry.set(alias, command)
        }
        logger.debug(`Comando cargado: ${command.name}`)
      }
    } catch (err) {
      logger.error({ err, file }, 'Error cargando comando')
    }
  }

  logger.info(`✅ ${commandRegistry.size} comandos cargados`)
}