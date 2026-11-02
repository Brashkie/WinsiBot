import type { Command } from '../../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import {
  MODES,
  MODE_DESCRIPTIONS,
  getMode,
  setMode,
  resetMode,
  getAllModes,
  type PersonalityMode,
} from './config.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function modesMenu(prefix: string): string {
  return [
    `◈ *Modos disponibles:*`,
    ``,
    ...MODES.map(m => `  ╰ *${prefix}hepein bot mode ${m}* — ${MODE_DESCRIPTIONS[m]}`),
    ``,
    `§ *${prefix}hepein bot mode reset* — volver al modo por defecto`,
    `§ *${prefix}hepein bot status* — ver modo actual`,
    `§ *${prefix}hepein bot modes* — ver todos los modos`,
  ].join('\n')
}

// ─── Comando ──────────────────────────────────────────────────────────────────
const command: Command = {
  name:        'hepein',
  aliases:     ['bot'],
  description: 'Controla la personalidad del bot',
  category:    'admin',
  adminOnly:   true,

  async execute({ sock, jid, msg, args, prefix, isOwner, isGroup }) {

    // #hepein sin args — mostrar menú
    if (!args.length) {
      const current = await getMode(isGroup ? jid : undefined)
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `◈ *Hepein Bot Control*`,
          ``,
          `§ Modo actual: *${current}* — ${MODE_DESCRIPTIONS[current as PersonalityMode] ?? ''}`,
          ``,
          modesMenu(prefix),
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // La forma corta también vale: "#hepein toxico", "#hepein mode toxico",
    // "#hepein modo toxico" y "#hepein status" son "#hepein bot mode toxico",
    // etc. Antes daban "Subcomando no reconocido", y "#hepein peruano" era
    // justo lo que dice docs/commands.md.
    const SINONIMOS: Record<string, string> = { modo: 'mode', estado: 'status', modos: 'modes' }
    const normal = args.map((a, i) => (i <= 1 ? SINONIMOS[a.toLowerCase()] ?? a.toLowerCase() : a.toLowerCase()))
    const conBot = normal[0] === 'bot' ? normal : ['bot', ...normal]
    const esModo = (m: string | undefined) => m === 'reset' || (MODES as readonly string[]).includes(m ?? '')
    const completo = esModo(conBot[1]) ? ['bot', 'mode', ...conBot.slice(1)] : conBot

    const sub = completo[0]    // bot
    const action = completo[1] // mode, status, modes
    const value  = completo[2] // sarcastico, alegre, etc

    // ─── #hepein bot status ───────────────────────────────────────────────
    if (sub === 'bot' && action === 'status') {
      const { global, groups } = await getAllModes()
      const groupMode = isGroup ? groups[jid] : undefined
      const lines = [
        `◈ *Bot Status — Personalidad*`,
        ``,
        `  Global:  *${global}* — ${MODE_DESCRIPTIONS[global as PersonalityMode] ?? ''}`,
      ]
      if (groupMode) {
        lines.push(`  Grupo:   *${groupMode}* — ${MODE_DESCRIPTIONS[groupMode as PersonalityMode] ?? ''}`)
      }
      if (isOwner && Object.keys(groups).length > 0) {
        lines.push(``, `§ Grupos con modo propio:`)
        for (const [g, m] of Object.entries(groups)) {
          lines.push(`  ╰ ${g.split('@')[0]} → *${m}*`)
        }
      }
      await safeSend(() => sock.sendMessage(jid, {
        text: lines.join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── #hepein bot modes ────────────────────────────────────────────────
    if (sub === 'bot' && action === 'modes') {
      await safeSend(() => sock.sendMessage(jid, {
        text: modesMenu(prefix),
      }, { quoted: msg }))
      return
    }

    // ─── #hepein bot mode <modo> ──────────────────────────────────────────
    if (sub === 'bot' && action === 'mode') {

      // reset
      if (value === 'reset') {
        const targetJid = isGroup ? jid : undefined
        await resetMode(targetJid)
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            `✔ Modo reiniciado a *amable*`,
            isGroup ? `§ Solo en este grupo` : `§ Modo global reiniciado`,
          ].join('\n'),
        }, { quoted: msg }))
        return
      }

      // validar modo
      if (!value || !MODES.includes(value as PersonalityMode)) {
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            `✗ Modo *${value ?? ''}* no existe`,
            ``,
            modesMenu(prefix),
          ].join('\n'),
        }, { quoted: msg }))
        return
      }

      // aplicar — admins solo cambian su grupo, owner puede cambiar global
      const targetJid = (!isGroup || (isOwner && !isGroup)) ? undefined : jid
      const ok = await setMode(value as PersonalityMode, targetJid)

      if (!ok) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No se pudo cambiar el modo — la Session API no responde`,
        }, { quoted: msg }))
        return
      }

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `✔ Modo cambiado a *${value}*`,
          `§ ${MODE_DESCRIPTIONS[value as PersonalityMode]}`,
          isGroup ? `§ Aplicado solo en este grupo` : `§ Aplicado globalmente`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── comando no reconocido ────────────────────────────────────────────
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `✗ Subcomando no reconocido`,
        ``,
        modesMenu(prefix),
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command