import type { Command } from '../../../types/index.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index.js'

// ─── Definición de opciones ───────────────────────────────────────────────────

type BoolKey =
  | 'antilink' | 'antilink2' | 'antispam' | 'antiflood' | 'antifake'
  | 'antibot'  | 'antidelete' | 'antitoxic' | 'antitraba'
  | 'antitelegram' | 'antidiscord' | 'antitiktok' | 'antiyoutube'
  | 'welcome'  | 'detect'   | 'modoadmin' | 'nsfw'  | 'muted'
  | 'anticall' | 'hepein'   | 'game'      | 'rpg'
  | 'reaction' | 'autosticker' | 'viewonce' | 'audios'
  | 'autoresponder' | 'autoAccept' | 'autoReject'

interface Opt {
  key:         BoolKey
  description: string
  adminOnly:   boolean
  ownerOnly:   boolean
}

// Categorías para el panel
const GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: '🛡️  Moderación',     keys: ['antilink','antilink2','antispam','antiflood','antifake','antibot','antidelete','antitoxic','antitraba'] },
  { label: '🚫  Anti-plataformas', keys: ['antitelegram','antidiscord','antitiktok','antiyoutube'] },
  { label: '📢  Bienvenida',       keys: ['welcome','detect'] },
  { label: '⚙️  Funciones',        keys: ['modoadmin','nsfw','muted','hepein','game','rpg','reaction','autosticker','viewonce','audios','autoresponder','autoAccept','autoReject'] },
  { label: '📵  Global (owner)',    keys: ['anticall'] },
]

const OPTIONS: Record<string, Opt> = {
  // ── Moderación ─────────────────────────────────────────────────────────────
  antilink:     { key: 'antilink',     description: 'Elimina links en el grupo',                    adminOnly: true,  ownerOnly: false },
  antilink2:    { key: 'antilink2',    description: 'Solo admins pueden enviar links',               adminOnly: true,  ownerOnly: false },
  antispam:     { key: 'antispam',     description: 'Detecta y elimina spam',                        adminOnly: true,  ownerOnly: false },
  antiflood:    { key: 'antiflood',    description: 'Limita mensajes rápidos seguidos',              adminOnly: true,  ownerOnly: false },
  antifake:     { key: 'antifake',     description: 'Bloquea números falsos/virtuales',              adminOnly: true,  ownerOnly: false },
  antibot:      { key: 'antibot',      description: 'Bloquea bots en el grupo',                      adminOnly: true,  ownerOnly: false },
  antidelete:   { key: 'antidelete',   description: 'Muestra mensajes eliminados',                   adminOnly: true,  ownerOnly: false },
  antitoxic:    { key: 'antitoxic',    description: 'Elimina palabras ofensivas',                    adminOnly: true,  ownerOnly: false },
  antitraba:    { key: 'antitraba',    description: 'Elimina textos que traban el chat',              adminOnly: true,  ownerOnly: false },
  // ── Anti-plataformas ───────────────────────────────────────────────────────
  antitelegram: { key: 'antitelegram', description: 'Bloquea links de Telegram',                     adminOnly: true,  ownerOnly: false },
  antidiscord:  { key: 'antidiscord',  description: 'Bloquea links de Discord',                      adminOnly: true,  ownerOnly: false },
  antitiktok:   { key: 'antitiktok',   description: 'Bloquea links de TikTok',                       adminOnly: true,  ownerOnly: false },
  antiyoutube:  { key: 'antiyoutube',  description: 'Bloquea links de YouTube',                      adminOnly: true,  ownerOnly: false },
  // ── Bienvenida ─────────────────────────────────────────────────────────────
  welcome:      { key: 'welcome',      description: 'Mensaje de bienvenida y despedida',              adminOnly: true,  ownerOnly: false },
  detect:       { key: 'detect',       description: 'Avisos de cambios en el grupo',                  adminOnly: true,  ownerOnly: false },
  // ── Funciones ──────────────────────────────────────────────────────────────
  modoadmin:    { key: 'modoadmin',    description: 'Solo admins pueden usar comandos',               adminOnly: true,  ownerOnly: false },
  nsfw:         { key: 'nsfw',         description: 'Activa comandos +18 en el grupo',                adminOnly: true,  ownerOnly: false },
  muted:        { key: 'muted',        description: 'Bot silenciado en este grupo',                   adminOnly: true,  ownerOnly: false },
  hepein:       { key: 'hepein',       description: 'IA responde cuando la mencionan',                adminOnly: true,  ownerOnly: false },
  game:         { key: 'game',         description: 'Comandos de juegos permitidos',                  adminOnly: true,  ownerOnly: false },
  rpg:          { key: 'rpg',          description: 'Comandos RPG permitidos',                        adminOnly: true,  ownerOnly: false },
  reaction:     { key: 'reaction',     description: 'Reacciones automáticas del bot',                 adminOnly: true,  ownerOnly: false },
  autosticker:  { key: 'autosticker',  description: 'Convierte imágenes a sticker automáticamente',  adminOnly: true,  ownerOnly: false },
  viewonce:     { key: 'viewonce',     description: 'Reenvía mensajes de ver-una-vez',                adminOnly: true,  ownerOnly: false },
  audios:       { key: 'audios',       description: 'Comandos de audio permitidos',                   adminOnly: true,  ownerOnly: false },
  autoresponder:{ key: 'autoresponder',description: 'Respuestas automáticas activas',                 adminOnly: true,  ownerOnly: false },
  autoaccept:   { key: 'autoAccept',   description: 'Acepta solicitudes de unirse automáticamente',   adminOnly: true,  ownerOnly: false },
  autoreject:   { key: 'autoReject',   description: 'Rechaza solicitudes automáticamente',            adminOnly: true,  ownerOnly: false },
  // ── Global (owner) ─────────────────────────────────────────────────────────
  anticall:     { key: 'anticall',     description: 'Rechaza llamadas automáticamente',               adminOnly: false, ownerOnly: true  },
}

const ALIASES: Record<string, string> = {
  'antienlace':     'antilink',
  'antienlace2':    'antilink2',
  'bienvenida':     'welcome',
  'avisos':         'detect',
  'antieliminar':   'antidelete',
  'soloadmin':      'modoadmin',
  'modeadmin':      'modoadmin',
  'antillamar':     'anticall',
  'antifalsos':     'antifake',
  'antivirtuales':  'antifake',
  'caliente':       'nsfw',
  'modohorny':      'nsfw',
  'ia':             'hepein',
  'bot':            'hepein',
  'ai':             'hepein',
  'chatbot':        'hepein',
  'chatgpt':        'hepein',
  'modoia':         'hepein',
  'juegos':         'game',
  'reaccion':       'reaction',
  'reacciones':     'reaction',
  'stickers':       'autosticker',
  'antitg':         'antitelegram',
  'antitel':        'antitelegram',
  'antitele':       'antitelegram',
  'antiyt':         'antiyoutube',
  'antitk':         'antitiktok',
  'antitik':        'antitiktok',
  'antidc':         'antidiscord',
  'antiver':        'viewonce',
  'antiviewonce':   'viewonce',
  'aceptar':        'autoaccept',
  'rechazar':       'autoreject',
  'antitraba':      'antitraba',
  'antilag':        'antitraba',
}

// ─── Helper: panel completo ───────────────────────────────────────────────────

function buildPanel(cfg: ReturnType<typeof getGroupConfig>, prefix: string): string {
  const lines: string[] = []
  lines.push(`┌─────────────────────────────`)
  lines.push(`│  ◈ *CONFIGURACIÓN DEL GRUPO*`)
  lines.push(`└─────────────────────────────`)

  for (const group of GROUPS) {
    lines.push(``)
    lines.push(`*${group.label}*`)
    for (const name of group.keys) {
      const opt = OPTIONS[name]
      if (!opt) continue
      const val    = cfg[opt.key] as boolean
      const icon   = val ? '✅' : '❌'
      const who    = opt.ownerOnly ? '▲' : '◆'
      lines.push(`  ${icon} ${who} *${name}* — ${opt.description}`)
    }
  }

  lines.push(``)
  lines.push(`─────────────────────────────`)
  lines.push(`  ${prefix}on  <opcion> — activar`)
  lines.push(`  ${prefix}off <opcion> — desactivar`)
  return lines.join('\n')
}

// ─── Comando ──────────────────────────────────────────────────────────────────

const command: Command = {
  name:        'on',
  aliases:     ['off', 'enable', 'disable'],
  description: 'Activa o desactiva funciones del grupo',
  category:    'admin',
  groupOnly:   true,

  async execute({ sock, jid, msg, args, command: cmd, prefix, isAdmin, isOwner }) {
    const isEnable = cmd === 'on' || cmd === 'enable'
    const cfg      = getGroupConfig(jid)

    // Sin argumento — mostrar panel
    if (!args[0]) {
      await sock.sendMessage(jid, { text: buildPanel(cfg, prefix) }, { quoted: msg })
      return
    }

    const rawType = (args[0] ?? '').toLowerCase()
    const type    = ALIASES[rawType] ?? rawType
    const option  = OPTIONS[type]

    if (!option) {
      await sock.sendMessage(jid, {
        text: `❌ Opción *${rawType}* no encontrada.\nUsa *${prefix}on* para ver todas las opciones.`,
      }, { quoted: msg })
      return
    }

    if (option.ownerOnly && !isOwner) {
      await sock.sendMessage(jid, {
        text: `❌ Solo el *owner* puede cambiar esta opción.`,
      }, { quoted: msg })
      return
    }

    if (option.adminOnly && !isAdmin && !isOwner) {
      await sock.sendMessage(jid, {
        text: `❌ Solo los *administradores* pueden cambiar esta opción.`,
      }, { quoted: msg })
      return
    }

    setGroupConfig(jid, { [option.key]: isEnable })

    const status = isEnable ? '✅ Activado' : '❌ Desactivado'
    await sock.sendMessage(jid, {
      text: [
        `┌─────────────────────────`,
        `│  ${status}`,
        `└─────────────────────────`,
        ``,
        `  ◆ *${type}*`,
        `  § ${option.description}`,
      ].join('\n'),
    }, { quoted: msg })
  },
}

export default command
