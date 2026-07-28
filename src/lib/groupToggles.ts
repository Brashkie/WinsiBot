// groupToggles.ts — fuente única de verdad para las ~30 configuraciones
// booleanas de grupo (antilink, antispam, welcome, etc.)
//
// La usan DOS lugares:
//  - admin/config.ts (#on/#off) — panel completo, un comando genérico
//  - Los comandos individuales (#antilink, #antispam, etc., uno por opción,
//    generados con createToggleCommand()) — cada uno con su propia tarjeta
//    de estado/instrucciones
//
// Definir la metadata acá una sola vez evita que las dos superficies
// (panel genérico vs. comando individual) queden con descripciones
// distintas o se desincronicen.

import { config } from '@config'
import { setAnticall } from '@core/events/anticall.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index.js'
import type { Command } from '../types/index.js'

export type BoolKey =
  | 'antilink'
  | 'antilink2'
  | 'antispam'
  | 'antiflood'
  | 'antifake'
  | 'antibot'
  | 'antidelete'
  | 'antitoxic'
  | 'antitraba'
  | 'antitelegram'
  | 'antidiscord'
  | 'antitiktok'
  | 'antiyoutube'
  | 'welcome'
  | 'detect'
  | 'modoadmin'
  | 'nsfw'
  | 'muted'
  | 'anticall'
  | 'hepein'
  | 'game'
  | 'rpg'
  | 'reaction'
  | 'autosticker'
  | 'viewonce'
  | 'audios'
  | 'autolevelup'
  | 'autoresponder'
  | 'autoAccept'
  | 'autoReject'

export interface ToggleOption {
  key: BoolKey
  label: string // nombre corto para mostrar en texto
  description: string // una línea — usada en el panel de #on/#off
  explanation: string // párrafo largo — usada en la tarjeta del comando individual. "{bot}" se reemplaza por el nombre del bot
  ownerOnly: boolean // si true, requiere ser owner en vez de admin del grupo
}

export const OPTIONS: Record<string, ToggleOption> = {
  // ── Moderación ─────────────────────────────────────────────────────────────
  antilink: {
    key: 'antilink',
    label: 'antilink',
    ownerOnly: false,
    description: 'Elimina links en el grupo',
    explanation:
      'Si el antilink está activado, {bot} eliminará los mensajes que contengan links de grupos de WhatsApp.',
  },
  antilink2: {
    key: 'antilink2',
    label: 'antilink2',
    ownerOnly: false,
    description: 'Solo admins pueden enviar links',
    explanation:
      'Si está activado, solo los administradores del grupo podrán enviar links — el resto de los mensajes con links se eliminan.',
  },
  antispam: {
    key: 'antispam',
    label: 'antispam',
    ownerOnly: false,
    description: 'Detecta y elimina spam',
    explanation:
      'Si el antispam está activado, {bot} detectará y eliminará mensajes repetidos o enviados en ráfaga.',
  },
  antiflood: {
    key: 'antiflood',
    label: 'antiflood',
    ownerOnly: false,
    description: 'Limita mensajes rápidos seguidos',
    explanation:
      'Si el antiflood está activado, {bot} limitará a quienes manden muchos mensajes seguidos en poco tiempo.',
  },
  antifake: {
    key: 'antifake',
    label: 'antifake',
    ownerOnly: false,
    description: 'Bloquea números falsos/virtuales',
    explanation:
      'Si el antifake está activado, {bot} eliminará o bloqueará números falsos/virtuales que entren al grupo.',
  },
  antibot: {
    key: 'antibot',
    label: 'antibot',
    ownerOnly: false,
    description: 'Bloquea bots en el grupo',
    explanation:
      'Si el antibot está activado, {bot} eliminará automáticamente a otros bots que entren al grupo.',
  },
  antidelete: {
    key: 'antidelete',
    label: 'antidelete',
    ownerOnly: false,
    description: 'Muestra mensajes eliminados',
    explanation:
      'Si el antidelete está activado, {bot} reenviará los mensajes que alguien borre en el grupo.',
  },
  antitoxic: {
    key: 'antitoxic',
    label: 'antitoxic',
    ownerOnly: false,
    description: 'Elimina palabras ofensivas',
    explanation:
      'Si el antitoxic está activado, {bot} eliminará mensajes con lenguaje ofensivo o tóxico.',
  },
  antitraba: {
    key: 'antitraba',
    label: 'antitraba',
    ownerOnly: false,
    description: 'Elimina textos que traban el chat',
    explanation:
      'Si el antitraba está activado, {bot} eliminará mensajes con texto pensado para trabar el chat.',
  },
  // ── Anti-plataformas ───────────────────────────────────────────────────────
  antitelegram: {
    key: 'antitelegram',
    label: 'antitelegram',
    ownerOnly: false,
    description: 'Bloquea links de Telegram',
    explanation:
      'Si está activado, {bot} eliminará los links de Telegram que se envíen en el grupo.',
  },
  antidiscord: {
    key: 'antidiscord',
    label: 'antidiscord',
    ownerOnly: false,
    description: 'Bloquea links de Discord',
    explanation:
      'Si está activado, {bot} eliminará los links de Discord que se envíen en el grupo.',
  },
  antitiktok: {
    key: 'antitiktok',
    label: 'antitiktok',
    ownerOnly: false,
    description: 'Bloquea links de TikTok',
    explanation: 'Si está activado, {bot} eliminará los links de TikTok que se envíen en el grupo.',
  },
  antiyoutube: {
    key: 'antiyoutube',
    label: 'antiyoutube',
    ownerOnly: false,
    description: 'Bloquea links de YouTube',
    explanation:
      'Si está activado, {bot} eliminará los links de YouTube que se envíen en el grupo.',
  },
  // ── Bienvenida ─────────────────────────────────────────────────────────────
  welcome: {
    key: 'welcome',
    label: 'welcome',
    ownerOnly: false,
    description: 'Mensaje de bienvenida y despedida',
    explanation:
      'Si está activado, {bot} manda un mensaje de bienvenida y despedida cuando alguien entra o sale del grupo.',
  },
  detect: {
    key: 'detect',
    label: 'detect',
    ownerOnly: false,
    description: 'Avisos de cambios en el grupo',
    explanation:
      'Si está activado, {bot} avisa en el grupo cuando cambia el nombre o la descripción.',
  },
  // ── Funciones ──────────────────────────────────────────────────────────────
  modoadmin: {
    key: 'modoadmin',
    label: 'modoadmin',
    ownerOnly: false,
    description: 'Solo admins pueden usar comandos',
    explanation:
      'Si está activado, solo los administradores del grupo pueden usar los comandos de {bot}.',
  },
  nsfw: {
    key: 'nsfw',
    label: 'nsfw',
    ownerOnly: false,
    description: 'Activa comandos +18 en el grupo',
    explanation: 'Si está activado, se habilitan los comandos +18 en este grupo.',
  },
  muted: {
    key: 'muted',
    label: 'mute',
    ownerOnly: false,
    description: 'Bot silenciado en este grupo',
    explanation:
      'Si está activado, {bot} deja de responder comandos en este grupo hasta que se desactive.',
  },
  hepein: {
    key: 'hepein',
    label: 'modoia',
    ownerOnly: false,
    description: 'IA responde cuando la mencionan',
    explanation:
      'Si está activado, {bot} responde con IA cuando lo mencionan o le responden un mensaje.',
  },
  game: {
    key: 'game',
    label: 'juegos',
    ownerOnly: false,
    description: 'Comandos de juegos permitidos',
    explanation: 'Si está activado, se habilitan los comandos de minijuegos en este grupo.',
  },
  rpg: {
    key: 'rpg',
    label: 'rpg',
    ownerOnly: false,
    description: 'Comandos RPG permitidos',
    explanation: 'Si está activado, se habilitan los comandos de RPG/economía en este grupo.',
  },
  reaction: {
    key: 'reaction',
    label: 'reaction',
    ownerOnly: false,
    description: 'Reacciones automáticas del bot',
    explanation: 'Si está activado, {bot} reacciona automáticamente a ciertos mensajes con emojis.',
  },
  autosticker: {
    key: 'autosticker',
    label: 'autosticker',
    ownerOnly: false,
    description: 'Convierte imágenes a sticker automáticamente',
    explanation:
      'Si está activado, {bot} convierte automáticamente las imágenes que se envíen en stickers.',
  },
  viewonce: {
    key: 'viewonce',
    label: 'viewonce',
    ownerOnly: false,
    description: 'Reenvía mensajes de ver-una-vez',
    explanation:
      'Si está activado, {bot} reenvía los mensajes de "ver una vez" (fotos/videos/audios) antes de que desaparezcan.',
  },
  audios: {
    key: 'audios',
    label: 'audios',
    ownerOnly: false,
    description: 'Comandos de audio permitidos',
    explanation:
      'Si está activado, se habilitan los comandos de audio (como #ytmp3) en este grupo.',
  },
  autolevelup: {
    key: 'autolevelup',
    label: 'autolevelup',
    ownerOnly: false,
    description: 'Anuncia en el chat cuando alguien sube de nivel',
    explanation: 'Si está activado, {bot} anuncia en el chat cuando alguien sube de nivel.',
  },
  autoresponder: {
    key: 'autoresponder',
    label: 'autoresponder',
    ownerOnly: false,
    description: 'Respuestas automáticas activas',
    explanation:
      'Si está activado, {bot} responde automáticamente a las palabras/frases configuradas para este grupo.',
  },
  autoaccept: {
    key: 'autoAccept',
    label: 'autoaccept',
    ownerOnly: false,
    description: 'Acepta solicitudes de unirse automáticamente',
    explanation:
      'Si está activado, {bot} acepta automáticamente las solicitudes para unirse al grupo.',
  },
  autoreject: {
    key: 'autoReject',
    label: 'autoreject',
    ownerOnly: false,
    description: 'Rechaza solicitudes automáticamente',
    explanation:
      'Si está activado, {bot} rechaza automáticamente las solicitudes para unirse al grupo.',
  },
  // ── Global (owner) ─────────────────────────────────────────────────────────
  anticall: {
    key: 'anticall',
    label: 'anticall',
    ownerOnly: true,
    description: 'Rechaza llamadas automáticamente',
    explanation:
      'Si está activado, {bot} rechaza automáticamente las llamadas de voz/video que le entren — afecta a toda la cuenta, no solo este grupo.',
  },
}

// Alias de ARGUMENTO para #on/#off (ej. "#on antienlace") — no confundir con
// los alias de COMANDO que tiene cada #antilink/#antispam/etc. por separado.
export const ARG_ALIASES: Record<string, string> = {
  antienlace: 'antilink',
  antienlace2: 'antilink2',
  bienvenida: 'welcome',
  avisos: 'detect',
  antieliminar: 'antidelete',
  soloadmin: 'modoadmin',
  modeadmin: 'modoadmin',
  antillamar: 'anticall',
  antifalsos: 'antifake',
  antivirtuales: 'antifake',
  caliente: 'nsfw',
  modohorny: 'nsfw',
  ia: 'hepein',
  bot: 'hepein',
  ai: 'hepein',
  chatbot: 'hepein',
  chatgpt: 'hepein',
  modoia: 'hepein',
  juegos: 'game',
  reaccion: 'reaction',
  reacciones: 'reaction',
  stickers: 'autosticker',
  antitg: 'antitelegram',
  antitel: 'antitelegram',
  antitele: 'antitelegram',
  antiyt: 'antiyoutube',
  antitk: 'antitiktok',
  antitik: 'antitiktok',
  antidc: 'antidiscord',
  antiver: 'viewonce',
  antiviewonce: 'viewonce',
  aceptar: 'autoaccept',
  rechazar: 'autoreject',
  antilag: 'antitraba',
  levelup: 'autolevelup',
  subirnivel: 'autolevelup',
  avisonivel: 'autolevelup',
}

// Categorías para el panel de #on/#off
export const GROUPS: Array<{ label: string; keys: string[] }> = [
  {
    label: 'Moderación',
    keys: [
      'antilink',
      'antilink2',
      'antispam',
      'antiflood',
      'antifake',
      'antibot',
      'antidelete',
      'antitoxic',
      'antitraba',
    ],
  },
  { label: 'Anti-plataformas', keys: ['antitelegram', 'antidiscord', 'antitiktok', 'antiyoutube'] },
  { label: 'Bienvenida', keys: ['welcome', 'detect'] },
  {
    label: 'Funciones',
    keys: [
      'modoadmin',
      'nsfw',
      'muted',
      'hepein',
      'game',
      'rpg',
      'reaction',
      'autosticker',
      'viewonce',
      'audios',
      'autolevelup',
      'autoresponder',
      'autoaccept',
      'autoreject',
    ],
  },
  { label: 'Global (owner)', keys: ['anticall'] },
]

// ─── Fábrica de comandos individuales (#antilink, #antispam, etc.) ────────────
export function createToggleCommand(optionName: string, name: string, aliases: string[]): Command {
  const opt = OPTIONS[optionName]!

  return {
    name,
    aliases,
    description: `Activa/desactiva ${opt.label} en el grupo`,
    category: 'admin',
    groupOnly: true,
    adminOnly: !opt.ownerOnly,
    ownerOnly: opt.ownerOnly,

    async execute({ sock, jid, msg, args, prefix }) {
      const cfg = getGroupConfig(jid)
      const raw = args[0]?.toLowerCase()

      const isEnable = raw === 'enable' || raw === 'activar' || raw === 'on'
      const isDisable = raw === 'disable' || raw === 'desactivar' || raw === 'off'

      // Sin argumento (o uno inválido) — tarjeta de instrucciones + estado actual
      if (!isEnable && !isDisable) {
        const state = cfg[opt.key] ? '✔ Activado' : '✗ Desactivado'
        await sock.sendMessage(
          jid,
          {
            text: [
              `❐ Un administrador puede activar o desactivar el *${opt.label}* utilizando:`,
              ``,
              `✎ Activar » ${prefix}${name} enable`,
              `✎ Desactivar » ${prefix}${name} disable`,
              ``,
              `✦ Estado actual: ${state}`,
              ``,
              opt.explanation.replace('{bot}', config.botName),
            ].join('\n'),
          },
          { quoted: msg },
        )
        return
      }

      const enable = isEnable
      setGroupConfig(jid, { [opt.key]: enable })

      // anticall es global (una llamada no pertenece a ningún grupo puntual),
      // así que además de guardarse acá para que el panel/tarjeta lo muestren
      // consistente, actualiza el flag real que usa handleCallUpdate.
      if (opt.key === 'anticall') setAnticall(enable)

      await sock.sendMessage(
        jid,
        {
          text: `✦ *${opt.label}* ahora está ${enable ? '✔ Activado' : '✗ Desactivado'}`,
        },
        { quoted: msg },
      )
    },
  }
}
