import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData, userData } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ─── Persistencia ─────────────────────────────────────────────────────────────

const DATA_DIR  = join(process.cwd(), 'data')
const BDAY_FILE = join(DATA_DIR, 'birthday.json')

interface BirthdayStore {
  groups:  Record<string, { enabled: boolean; message?: string }>  // groupJid → config
  optOut:  string[]   // JIDs que no quieren ser celebrados
}

function loadStore(): BirthdayStore {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    return JSON.parse(readFileSync(BDAY_FILE, 'utf-8'))
  } catch {
    return { groups: {}, optOut: [] }
  }
}

function saveStore(s: BirthdayStore): void {
  writeFileSync(BDAY_FILE, JSON.stringify(s, null, 2))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parseBirth(input: string): string | null {
  const m = input.match(/^(\d{1,2})[/\-.](\d{1,2})$/)
  if (!m) return null
  const day = parseInt(m[1]!)
  const mon = parseInt(m[2]!)
  if (day < 1 || day > 31 || mon < 1 || mon > 12) return null
  return `${String(day).padStart(2, '0')}/${String(mon).padStart(2, '0')}`
}

function isBirthdayToday(birth: string): boolean {
  return birth === todayStr()
}

// Quiénes cumplen hoy en la lista de JIDs dada
function birthdaysToday(jids: string[]): Array<{ jid: string; name: string }> {
  const store = loadStore()
  const today = todayStr()
  const result: Array<{ jid: string; name: string }> = []

  for (const jid of jids) {
    if (store.optOut.includes(jid)) continue
    try {
      const u = getUserData(jid)
      if (u.profile?.birth === today) {
        result.push({ jid, name: u.name || jid.split('@')[0]! })
      }
    } catch {}
  }
  return result
}

// ─── Auto-celebración (llamar desde index.ts) ─────────────────────────────────

export function setupBirthdayChecker(sock: any): void {
  const check = async () => {
    const now  = new Date()
    // Solo ejecutar cerca de medianoche (00:00 – 00:05)
    if (now.getHours() !== 0 || now.getMinutes() > 5) return

    const store = loadStore()
    const today = todayStr()

    for (const [groupJid, cfg] of Object.entries(store.groups)) {
      if (!cfg.enabled) continue
      try {
        const meta  = await sock.groupMetadata(groupJid)
        const jids  = meta.participants.map((p: any) => p.id)
        const bdays = birthdaysToday(jids)
        if (bdays.length === 0) continue

        const mentions = bdays.map(b => b.jid)
        const names    = bdays.map(b => `@${b.jid.split('@')[0]}`).join(', ')

        await safeSend(() => sock.sendMessage(groupJid, {
          text: [
            `🎂 *¡Feliz cumpleaños!* 🎉`,
            ``,
            `Hoy cumplen años: ${names}`,
            ``,
            `✨ ¡Que la pases increíble y que todos tus deseos se cumplan!`,
          ].join('\n'),
          mentions,
        }))
      } catch {}
    }
  }

  // Verificar cada 5 minutos
  setInterval(check, 5 * 60_000)
}

// ─── Comando ──────────────────────────────────────────────────────────────────

const command: Command = {
  name:        'birthday',
  aliases:     ['cumpleaños', 'bday', 'bd'],
  description: 'Sistema de cumpleaños  |  !birthday set DD/MM  |  !birthday list',
  category:    'general',
  cooldown:    3,

  async execute({ sock, jid, msg, sender, pushName, args, isGroup, isAdmin, prefix }) {
    const sub = (args[0] ?? '').toLowerCase()

    // ─── !birthday set DD/MM ───────────────────────────────────────────────
    if (sub === 'set' || sub === 'fijar' || sub === 'establecer') {
      const dateArg = args[1]
      if (!dateArg) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `_Ejemplo:_ \`${prefix}birthday set 25/12\``,
        }, { quoted: msg }))
        return
      }

      const birth = parseBirth(dateArg)
      if (!birth) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Formato inválido. Usa *DD/MM*  Ej: \`25/12\``,
        }, { quoted: msg }))
        return
      }

      patchUserData(sender, { profile: { birth } })

      const isToday = isBirthdayToday(birth)
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `🎂 *Cumpleaños guardado:* ${birth}`,
          isToday ? `\n🎉 ¡Hoy es tu cumpleaños! ¡Feliz cumpleaños ${pushName}! 🎉` : '',
        ].join(''),
      }, { quoted: msg }))
      return
    }

    // ─── !birthday allow ───────────────────────────────────────────────────
    if (sub === 'allow' || sub === 'permitir') {
      const store = loadStore()
      store.optOut = store.optOut.filter(j => j !== sender)
      saveStore(store)
      await safeSend(() => sock.sendMessage(jid, {
        text: `✅ Permitiste que se celebre tu cumpleaños en los grupos donde esté activo.`,
      }, { quoted: msg }))
      return
    }

    // ─── !birthday deny ────────────────────────────────────────────────────
    if (sub === 'deny' || sub === 'denegar' || sub === 'desactivar') {
      const store = loadStore()
      if (!store.optOut.includes(sender)) store.optOut.push(sender)
      saveStore(store)
      await safeSend(() => sock.sendMessage(jid, {
        text: `🚫 Tu cumpleaños ya no será celebrado en ningún servidor.`,
      }, { quoted: msg }))
      return
    }

    // ─── !birthday setup (admin) ───────────────────────────────────────────
    if (sub === 'setup' || sub === 'configurar' || sub === 'config') {
      if (!isGroup) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Este subcomando solo funciona en grupos.`,
        }, { quoted: msg }))
        return
      }
      if (!isAdmin) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Solo los administradores pueden configurar esto.`,
        }, { quoted: msg }))
        return
      }

      const toggleArg = args[1]?.toLowerCase()
      const store = loadStore()
      const current = store.groups[jid] ?? { enabled: false }

      if (toggleArg === 'on' || toggleArg === 'activar') {
        store.groups[jid] = { ...current, enabled: true }
        saveStore(store)
        await safeSend(() => sock.sendMessage(jid, {
          text: `✅ Celebraciones de cumpleaños *activadas* en este grupo.\n_El bot enviará un mensaje automático cada día a medianoche._`,
        }, { quoted: msg }))
        return
      }

      if (toggleArg === 'off' || toggleArg === 'desactivar') {
        store.groups[jid] = { ...current, enabled: false }
        saveStore(store)
        await safeSend(() => sock.sendMessage(jid, {
          text: `🚫 Celebraciones de cumpleaños *desactivadas* en este grupo.`,
        }, { quoted: msg }))
        return
      }

      // Sin toggle → mostrar estado actual
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `🎂 *Configuración de cumpleaños*`,
          ``,
          `  Estado:  ${current.enabled ? '✅ Activo' : '❌ Inactivo'}`,
          ``,
          `§ \`${prefix}birthday setup on\`   — activar`,
          `§ \`${prefix}birthday setup off\`  — desactivar`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ─── !birthday list ────────────────────────────────────────────────────
    if (sub === 'list' || sub === 'lista' || sub === 'hoy') {
      if (!isGroup) {
        // En privado: mostrar el propio cumpleaños
        const user = getUserData(sender, pushName)
        const birth = user.profile?.birth
        await safeSend(() => sock.sendMessage(jid, {
          text: birth
            ? `🎂 Tu cumpleaños está registrado como *${birth}*`
            : `> No tienes cumpleaños registrado.\n> Usa \`${prefix}birthday set DD/MM\``,
        }, { quoted: msg }))
        return
      }

      const meta  = await sock.groupMetadata(jid).catch(() => null)
      if (!meta) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> No se pudo obtener la lista del grupo.`,
        }, { quoted: msg }))
        return
      }

      const jids  = meta.participants.map((p: any) => p.id as string)
      const bdays = birthdaysToday(jids)

      if (bdays.length === 0) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `🎂 Hoy no hay cumpleaños en el grupo. (${todayStr()})`,
        }, { quoted: msg }))
        return
      }

      const mentions = bdays.map(b => b.jid)
      const lines    = bdays.map((b, i) => `  ${i + 1}. @${b.jid.split('@')[0]} ${b.name !== b.jid.split('@')[0] ? `— ${b.name}` : ''}`)

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `🎂 *Cumpleaños de hoy (${todayStr()})*`,
          ``,
          lines.join('\n'),
          ``,
          `🎉 ¡Felicítalos!`,
        ].join('\n'),
        mentions,
      }, { quoted: msg }))
      return
    }

    // ─── !birthday (sin subcomando) — ver el propio ────────────────────────
    const user  = getUserData(sender, pushName)
    const birth = user.profile?.birth

    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `🎂 *Sistema de cumpleaños*`,
        ``,
        birth
          ? `  Tu cumpleaños: *${birth}*  ${isBirthdayToday(birth) ? '🎉 ¡Hoy!' : ''}`
          : `  No tienes cumpleaños registrado`,
        ``,
        `§ \`${prefix}birthday set DD/MM\`   — registrar fecha`,
        `§ \`${prefix}birthday list\`          — ver hoy en el grupo`,
        `§ \`${prefix}birthday allow\`          — permitir celebración`,
        `§ \`${prefix}birthday deny\`           — desactivar celebración`,
        isAdmin && isGroup
          ? `§ \`${prefix}birthday setup on/off\` — config admin`
          : '',
      ].filter(Boolean).join('\n'),
    }, { quoted: msg }))
  },
}

export default command
