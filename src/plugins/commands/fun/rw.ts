import type { Command, RollCharacter, RollData } from '../../../types/index.js'
import axios from 'axios'
import { downloadBuffer } from '@lib/downloader.js'

// ─── Fuentes ──────────────────────────────────────────────────────────────────
const SOURCES: Record<string, string> = {
  marvel: 'https://raw.githubusercontent.com/Brashkie/module/main/rollimage/marvel.json',
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const charCache  = new Map<string, RollCharacter[]>()
const sleep      = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Cooldowns ────────────────────────────────────────────────────────────────
const RW_COOLDOWN = 29 * 60 * 1000
const rwCooldowns = new Map<string, number>()

// ─── Personaje activo por grupo ───────────────────────────────────────────────
export interface ActiveChar {
  char:      RollCharacter
  rolledBy:  string
  jid:       string
  expiresAt: number
  claimedBy: string | null
  claimedAt: number | null
  stealEnds: number | null
  msgKey:    any
}

export const activeChars = new Map<string, ActiveChar>()

// ─── Inventario ───────────────────────────────────────────────────────────────
export const inventory = new Map<string, RollCharacter[]>()

export function getUserInventory(jid: string): RollCharacter[] {
  if (!inventory.has(jid)) inventory.set(jid, [])
  return inventory.get(jid)!
}

export function addToInventory(jid: string, char: RollCharacter): void {
  const inv = getUserInventory(jid)
  inv.push({ ...char, user: jid })
  inventory.set(jid, inv)
}

export function removeFromInventory(jid: string, charName: string): RollCharacter | null {
  const inv = getUserInventory(jid)
  const idx = inv.findIndex(c => c.name.toLowerCase() === charName.toLowerCase())
  if (idx === -1) return null
  return inv.splice(idx, 1)[0] ?? null
}

async function getCharacters(source: string): Promise<RollCharacter[]> {
  if (charCache.has(source)) return charCache.get(source)!
  const url = SOURCES[source]
  if (!url)  return []
  const res  = await axios.get<RollData>(url, {
    timeout: 15_000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
  })
  const chars = res.data.personajes ?? []
  charCache.set(source, chars)
  return chars
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ─── Comando ──────────────────────────────────────────────────────────────────
const command: Command = {
  name: 'rw',
  aliases: ['roll', 'rollimage', 'gacha'],
  description: 'Obtiene un personaje aleatorio',
  category: 'fun',
  cooldown: 0,
  groupOnly: true,

  async execute({ sock, jid, msg, args, sender, prefix }) {
    const source = args[0]?.toLowerCase() ?? 'marvel'

    if (!SOURCES[source]) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Fuente *${source}* no disponible.`,
          ``,
          `  Disponibles:`,
          `  ╰ ${prefix}rw marvel`,
          ``,
          `  § Proximamente: anime, dc, pokemon`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // ─── cooldown ─────────────────────────────────────────────────────────────
    const lastRoll  = rwCooldowns.get(sender) ?? 0
    const elapsed   = Date.now() - lastRoll
    if (elapsed < RW_COOLDOWN) {
      const remaining = RW_COOLDOWN - elapsed
      await sock.sendMessage(jid, {
        text: `✗ Debes esperar *${formatTime(remaining)}* para volver a rodar.`,
      }, { quoted: msg })
      return
    }

    // ─── personaje activo en el grupo ─────────────────────────────────────────
    const existing = activeChars.get(jid)
    if (existing && existing.expiresAt > Date.now()) {
      const remaining = existing.expiresAt - Date.now()
      await sock.sendMessage(jid, {
        text: [
          `✗ Ya hay un personaje activo: *${existing.char.name}*`,
          `  § Expira en ${formatTime(remaining)}`,
          `  § Responde al mensaje del personaje con *${prefix}c* para reclamarlo`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // animacion
    const sent = await sock.sendMessage(jid, {
      text: '◈ Rodando personaje...',
    }, { quoted: msg })
    const key = sent?.key

    const frames = [
      '◈◈ Buscando personaje...',
      '◈◈◈ Seleccionando...',
    ]

    const [chars] = await Promise.all([
      getCharacters(source).catch(() => [] as RollCharacter[]),
      (async () => {
        for (const frame of frames) {
          await sleep(400)
          await sock.sendMessage(jid, { text: frame, edit: key } as any)
        }
      })(),
    ])

    if (!chars.length) {
      await sock.sendMessage(jid, {
        text: '✗ No se pudieron obtener personajes.',
        edit: key,
      } as any)
      return
    }

    const char = pickRandom(chars)

    // registrar cooldown
    rwCooldowns.set(sender, Date.now())

    // borrar animacion
    //if (key) await sock.sendMessage(jid, { delete: key }).catch(() => {})
    //await sleep(150)

    // descargar imagen
    let buffer: Buffer | null = null
    try {
      buffer = await downloadBuffer(char.image)
    } catch {}

    const caption = [
      `◈ Nombre ⇝ *${char.name}*`,
      `⚥ Genero ⇝ *${char.gender}*`,
      `☆ Valor ⇝ *${char.value}*`,
      `♡ Estado ⇝ *${char.status}*`,
      `◆ Fuente ⇝ *${char.source}*`,
      char.habilidad ? `> Habilidad » ${char.habilidad}` : '',
      char.debilidad ? `> Debilidad » ${char.debilidad}` : '',
    ].filter(Boolean).join('\n')

    // enviar imagen
    let sentImg: any = null
    if (buffer) {
      sentImg = await sock.sendMessage(jid, {
        image:   buffer,
        caption,
      })
    } else {
      sentImg = await sock.sendMessage(jid, { text: caption })
    }

    // registrar personaje activo con el key del mensaje de imagen
    const expiresAt = Date.now() + 10 * 60 * 1000
    activeChars.set(jid, {
      char,
      rolledBy:  sender,
      jid,
      expiresAt,
      claimedBy: null,
      claimedAt: null,
      stealEnds: null,
      msgKey:    sentImg?.key ?? null,
    })

    // limpiar después de 10 min si nadie reclama
    setTimeout(() => {
      const active = activeChars.get(jid)
      if (active?.char.name === char.name && !active.claimedBy) {
        activeChars.delete(jid)
      }
    }, 10 * 60 * 1000)
  },
}

export default command