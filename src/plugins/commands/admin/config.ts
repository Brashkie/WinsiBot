import { setAnticall } from '@core/events/anticall.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index.js'
import { ARG_ALIASES, GROUPS, OPTIONS } from '@lib/groupToggles.js'
import type { Command } from '../../../types/index.js'

// ─── Helper: panel completo ───────────────────────────────────────────────────
// Mismo lenguaje visual que la tarjeta individual de cada opción
// (createToggleCommand en groupToggles.ts): ✔/✗ para estado, ✦ para acento.
// La caja sigue siendo la forma correcta para un LISTADO de 30 opciones a la
// vez — la tarjeta ❐/✎ de cada comando individual es la que tiene sentido
// para una sola opción, no para el panel completo.

function buildPanel(cfg: ReturnType<typeof getGroupConfig>, prefix: string): string {
  const lines: string[] = []
  lines.push(`❐ *Configuración del grupo*`)

  for (const group of GROUPS) {
    lines.push(``)
    lines.push(`✦ *${group.label}*`)
    for (const name of group.keys) {
      const opt = OPTIONS[name]
      if (!opt) continue
      const val = cfg[opt.key] as boolean
      const state = val ? '✔' : '✗'
      const who = opt.ownerOnly ? '▲' : '◆'
      lines.push(`${who} ${state} \`${name}\` — ${opt.description}`)
    }
  }

  lines.push(``)
  lines.push(`✎ Cada opción es también su propio comando — ej. \`${prefix}antilink enable\``)
  lines.push(`✎ O usá \`${prefix}on <opcion>\` / \`${prefix}off <opcion>\` acá mismo`)
  return lines.join('\n')
}

// ─── Comando ──────────────────────────────────────────────────────────────────

const command: Command = {
  name: 'on',
  aliases: ['off', 'enable', 'disable'],
  description: 'Activa o desactiva funciones del grupo',
  category: 'admin',
  groupOnly: true,

  async execute({ sock, jid, msg, args, command: cmd, prefix, isAdmin, isOwner }) {
    const isEnable = cmd === 'on' || cmd === 'enable'
    const cfg = getGroupConfig(jid)

    // Sin argumento — mostrar panel
    if (!args[0]) {
      await sock.sendMessage(jid, { text: buildPanel(cfg, prefix) }, { quoted: msg })
      return
    }

    const rawType = (args[0] ?? '').toLowerCase()
    const type = ARG_ALIASES[rawType] ?? rawType
    const option = OPTIONS[type]

    if (!option) {
      await sock.sendMessage(
        jid,
        {
          text: `✗ Opción *${rawType}* no encontrada.\nUsa *${prefix}on* para ver todas las opciones.`,
        },
        { quoted: msg },
      )
      return
    }

    if (option.ownerOnly && !isOwner) {
      await sock.sendMessage(
        jid,
        {
          text: `✗ Solo el *owner* puede cambiar esta opción.`,
        },
        { quoted: msg },
      )
      return
    }

    if (!option.ownerOnly && !isAdmin && !isOwner) {
      await sock.sendMessage(
        jid,
        {
          text: `✗ Solo los *administradores* pueden cambiar esta opción.`,
        },
        { quoted: msg },
      )
      return
    }

    setGroupConfig(jid, { [option.key]: isEnable })

    // anticall es global (una llamada no pertenece a ningún grupo puntual),
    // así que además de guardarse en este grupo para que el panel lo muestre
    // consistente, actualiza el flag real que usa handleCallUpdate.
    if (option.key === 'anticall') {
      setAnticall(isEnable)
    }

    // Misma confirmación de una línea que usa cada comando individual
    // (createToggleCommand en groupToggles.ts) — consistente sea cual sea
    // el camino que se usó para llegar acá.
    await sock.sendMessage(
      jid,
      {
        text: `✦ *${option.label}* ahora está ${isEnable ? '✔ Activado' : '✗ Desactivado'}`,
      },
      { quoted: msg },
    )
  },
}

export default command
