import type { Command } from '../../../types/index.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index'

// ─── Opciones disponibles ─────────────────────────────────────────────────────
type ConfigKey = keyof ReturnType<typeof getGroupConfig>

interface ConfigOption {
  key:         ConfigKey
  description: string
  adminOnly:   boolean
  ownerOnly:   boolean
}

const OPTIONS: Record<string, ConfigOption> = {
  // moderacion
  antilink:   { key: 'antilink',   description: 'Elimina links en el grupo',              adminOnly: true,  ownerOnly: false },
  antispam:   { key: 'antispam',   description: 'Detecta y elimina spam',                  adminOnly: true,  ownerOnly: false },
  antifake:   { key: 'antifake',   description: 'Bloquea numeros falsos/virtuales',        adminOnly: true,  ownerOnly: false },
  antidelete: { key: 'antidelete', description: 'Muestra mensajes eliminados',              adminOnly: true,  ownerOnly: false },
  modoadmin:  { key: 'modoadmin',  description: 'Solo admins pueden usar comandos',        adminOnly: true,  ownerOnly: false },
  // welcome
  welcome:    { key: 'welcome',    description: 'Mensaje de bienvenida y despedida',       adminOnly: true,  ownerOnly: false },
  detect:     { key: 'detect',     description: 'Avisos de cambios en el grupo',           adminOnly: true,  ownerOnly: false },
  // misc
  nsfw:       { key: 'nsfw',       description: 'Activa comandos +18 en el grupo',         adminOnly: true,  ownerOnly: false },
  muted:      { key: 'muted',      description: 'Bot no responde en este grupo',           adminOnly: true,  ownerOnly: false },
  // ia
  hepein:     { key: 'hepein',     description: 'IA responde cuando la mencionan',         adminOnly: true,  ownerOnly: false },
  // owner
  anticall:   { key: 'anticall',   description: 'Rechaza llamadas automaticamente',        adminOnly: false, ownerOnly: true  },
}

// alias
const ALIASES: Record<string, string> = {
  'antienlace':    'antilink',
  'antilink2':     'antilink',
  'bienvenida':    'welcome',
  'avisos':        'detect',
  'antieliminar':  'antidelete',
  'soloadmin':     'modoadmin',
  'modeadmin':     'modoadmin',
  'antillamar':    'anticall',
  'antifake':      'antifake',
  'antifalsos':    'antifake',
  'caliente':      'nsfw',
  'modohorny':     'nsfw',
  'ia':            'hepein',
  'bot':           'hepein',
  'ai':            'hepein',
}

const command: Command = {
  name:        'on',
  aliases:     ['off', 'enable', 'disable'],
  description: 'Activa o desactiva funciones del grupo',
  category:    'admin',
  groupOnly:   true,

  async execute({ sock, jid, msg, args, command: cmd, prefix, isAdmin, isOwner }) {
    const isEnable = cmd === 'on' || cmd === 'enable'

    // sin argumento — mostrar lista de opciones
    if (!args[0]) {
      const config = getGroupConfig(jid)
      const lines: string[] = []

      lines.push(`┌─────────────────────────`)
      lines.push(`│  ◈ *CONFIGURACION DEL GRUPO*`)
      lines.push(`└─────────────────────────`)
      lines.push(``)

      for (const [name, opt] of Object.entries(OPTIONS)) {
        const val    = config[opt.key] as boolean
        const status = val ? '✔' : '✗'
        const who    = opt.ownerOnly ? '▲ owner' : '◈ admin'
        lines.push(`  ${status} *${name}*  ·  ${who}`)
        lines.push(`     ${opt.description}`)
        lines.push(``)
      }

      lines.push(`─────────────────────────`)
      lines.push(`  ${prefix}on <opcion>   — activar`)
      lines.push(`  ${prefix}off <opcion>  — desactivar`)

      await sock.sendMessage(jid, {
        text: lines.join('\n'),
      }, { quoted: msg })
      return
    }

    const rawType = (args[0] ?? '').toLowerCase()
    const type    = ALIASES[rawType] ?? rawType
    const option  = OPTIONS[type]

    if (!option) {
      await sock.sendMessage(jid, {
        text: `✗ Opcion *${rawType}* no encontrada.\nUsa *${prefix}on* para ver todas las opciones.`,
      }, { quoted: msg })
      return
    }

    // verificar permisos
    if (option.ownerOnly && !isOwner) {
      await sock.sendMessage(jid, {
        text: `✗ Solo el *owner* puede cambiar esta opcion.`,
      }, { quoted: msg })
      return
    }

    if (option.adminOnly && !isAdmin && !isOwner) {
      await sock.sendMessage(jid, {
        text: `✗ Solo los *administradores* pueden cambiar esta opcion.`,
      }, { quoted: msg })
      return
    }

    // aplicar cambio
    setGroupConfig(jid, { [option.key]: isEnable })

    const status = isEnable ? '✔ Activado' : '✗ Desactivado'

    await sock.sendMessage(jid, {
      text: [
        `┌─────────────────────────`,
        `│  ${status}`,
        `└─────────────────────────`,
        ``,
        `  ◆ *${type}*`,
        `  § ${option.description}`,
        isEnable && type === 'hepein'
          ? `\n  § Menciona *hepein* o *brashkie* para activarme`
          : '',
      ].filter(Boolean).join('\n'),
    }, { quoted: msg })
  },
}

export default command