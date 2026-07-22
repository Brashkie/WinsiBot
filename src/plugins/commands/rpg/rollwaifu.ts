import type { Command, RollCharacter, RollData } from '../../../types/index.js'
import axios from 'axios'
import { decode } from '@msgpack/msgpack'
import { downloadBuffer } from '@lib/downloader.js'
import { createCache, registerCache } from '@lib/cacheManager.js'
import { userData } from '@core/events/index.js'

function ownerName(jid: string): string {
  return userData.get(jid)?.name || jid.replace(/@s\.whatsapp\.net|@lid/g, '').replace(/[^0-9]/g, '')
}

// ─── Fuentes ──────────────────────────────────────────────────────────────────
// module-data (MessagePack) reemplaza a module (JSON) — mismo contenido
// verificado byte a byte (250/1350/500 personajes, cero diferencias), pero
// 13-19% más liviano por archivo, y se decodifica directo a binario sin pasar
// por el parser de texto de JSON.
export const SOURCES: Record<string, string> = {
  marvel:  'https://raw.githubusercontent.com/Brashkie/module-data/main/rollmedia/marvel.msgpack',
  pokedex: 'https://raw.githubusercontent.com/Brashkie/module-data/main/rollmedia/pokedex.msgpack',
  anime:   'https://raw.githubusercontent.com/Brashkie/module-data/main/rollmedia/anime-character.msgpack',
}

// ─── Cache — 1h de TTL en vez de "para siempre" (las listas rara vez cambian,
// pero así una actualización del JSON en GitHub se refleja sin reiniciar) ────
export const charCache = registerCache('rwCharacters', createCache<RollCharacter[]>({ ttl: 60 * 60_000 }))
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Cooldowns ────────────────────────────────────────────────────────────────
export const RW_COOLDOWN = 29 * 60 * 1000
export const rwCooldowns = new Map<string, number>()

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

// Un roll activo POR USUARIO POR GRUPO, no uno solo compartido por todo el
// grupo — antes, si alguien tiraba un personaje y no lo reclamaba, NADIE MÁS
// en el grupo podía usar #rw hasta que ese roll expirara o se reclamara,
// aunque fueran personas completamente distintas tirando su propio
// personaje. jid -> sender -> roll.
export const activeChars = new Map<string, Map<string, ActiveChar>>()

export function getUserActiveChar(jid: string, sender: string): ActiveChar | undefined {
  return activeChars.get(jid)?.get(sender)
}

export function setUserActiveChar(jid: string, sender: string, active: ActiveChar): void {
  if (!activeChars.has(jid)) activeChars.set(jid, new Map())
  activeChars.get(jid)!.set(sender, active)
}

export function deleteUserActiveChar(jid: string, sender: string): void {
  activeChars.get(jid)?.delete(sender)
}

// #c es una respuesta a un mensaje puntual — cualquiera del grupo puede
// reclamarlo (o robarlo dentro de la ventana), no solo quien lo tiró, así que
// hay que buscar por el ID del mensaje citado entre TODOS los rolls activos
// del grupo, no asumir que hay uno solo.
export function findActiveCharByMsgId(
  jid: string, msgId: string,
): { rolledBy: string; active: ActiveChar } | null {
  const groupMap = activeChars.get(jid)
  if (!groupMap) return null
  for (const [rolledBy, active] of groupMap) {
    if (active.msgKey?.id === msgId) return { rolledBy, active }
  }
  return null
}

// ─── Inventario ───────────────────────────────────────────────────────────────
export const inventory = new Map<string, RollCharacter[]>()

export function getUserInventory(jid: string): RollCharacter[] {
  if (!inventory.has(jid)) inventory.set(jid, [])
  return inventory.get(jid)!
}

// ─── Exclusividad por grupo ───────────────────────────────────────────────────
// Un mismo personaje puede tener dueños distintos en grupos distintos (cada
// grupo es su propia "economía"), pero dentro de UN mismo grupo, una vez
// reclamado ya no puede volver a salir en #rw ni reclamarse de nuevo — ya
// tiene dueño ahí. Se indexa en memoria desde `inventory` (fuente de verdad
// persistida) via rebuildGroupClaims(), no es un Map separado a sincronizar.
export const claimedInGroup = new Map<string, Map<string, string>>() // groupJid -> charKey -> ownerJid

export function charKey(char: RollCharacter): string {
  return `${char.source}:${char.id}`
}

export function getGroupClaim(groupJid: string, char: RollCharacter): string | null {
  return claimedInGroup.get(groupJid)?.get(charKey(char)) ?? null
}

function registerGroupClaim(groupJid: string, char: RollCharacter, owner: string): void {
  if (!claimedInGroup.has(groupJid)) claimedInGroup.set(groupJid, new Map())
  claimedInGroup.get(groupJid)!.set(charKey(char), owner)
}

/** Reconstruye claimedInGroup desde `inventory` — llamar tras cargar inventory.json al arrancar. */
export function rebuildGroupClaims(): void {
  claimedInGroup.clear()
  for (const [owner, chars] of inventory.entries()) {
    for (const char of chars) {
      if (char.claimedGroup) registerGroupClaim(char.claimedGroup, char, owner)
    }
  }
}

export function addToInventory(jid: string, char: RollCharacter, groupJid: string): void {
  const inv = getUserInventory(jid)
  inv.push({ ...char, user: jid, claimedAt: Date.now(), claimedGroup: groupJid })
  inventory.set(jid, inv)
  registerGroupClaim(groupJid, char, jid)
}

export function removeFromInventory(jid: string, charName: string): RollCharacter | null {
  const inv = getUserInventory(jid)
  const idx = inv.findIndex(c => c.name.toLowerCase() === charName.toLowerCase())
  if (idx === -1) return null
  return inv.splice(idx, 1)[0] ?? null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export async function getCharacters(source: string): Promise<RollCharacter[]> {
  if (charCache.has(source)) return charCache.get(source)!
  const url = SOURCES[source]
  if (!url)  return []
  const res  = await axios.get<ArrayBuffer>(url, {
    timeout:      15_000,
    responseType: 'arraybuffer',
    headers:      { 'User-Agent': 'Mozilla/5.0 (compatible; WinsiBot/1.0)' },
  })
  const data  = decode(new Uint8Array(res.data)) as RollData
  const chars = data.personajes ?? []
  charCache.set(source, chars)
  return chars
}

export function pickImage(image: string | string[]): string {
  return Array.isArray(image) ? image[Math.floor(Math.random() * image.length)]! : image
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
  aliases: ['roll', 'rollimage', 'gacha', 'rollwaifu'],
  description: 'Obtiene un personaje aleatorio',
  category: 'rpg',
  cooldown: 0,
  groupOnly: true,

  async execute({ sock, jid, msg, args, sender, prefix }) {
    // Sin argumento → ruleta entre todas las fuentes (no solo Marvel)
    const source = args[0]?.toLowerCase() ?? pickRandom(Object.keys(SOURCES))

    if (!SOURCES[source]) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Fuente *${source}* no disponible.`,
          ``,
          `  Disponibles:`,
          ...Object.keys(SOURCES).map(s => `  ╰ ${prefix}rw ${s}`),
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // ─── cooldown ─────────────────────────────────────────────────────────────
    const lastRoll = rwCooldowns.get(sender) ?? 0
    const elapsed  = Date.now() - lastRoll
    if (elapsed < RW_COOLDOWN) {
      await sock.sendMessage(jid, {
        text: `✗ Debes esperar *${formatTime(RW_COOLDOWN - elapsed)}* para volver a rodar.`,
      }, { quoted: msg })
      return
    }

    // ─── personaje activo del usuario en el grupo ─────────────────────────────
    const existing = getUserActiveChar(jid, sender)
    if (existing && existing.expiresAt > Date.now()) {
      const remaining = existing.expiresAt - Date.now()
      await sock.sendMessage(jid, {
        text: [
          `✗ Ya tenés un personaje activo: *${existing.char.name}*`,
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

    // Excluir personajes que ya tienen dueño EN ESTE GRUPO — en otro grupo
    // el mismo personaje puede volver a salir y tener otro dueño distinto.
    const available = chars.filter(c => !getGroupClaim(jid, c))
    if (!available.length) {
      await sock.sendMessage(jid, {
        text: `✗ Ya no quedan personajes de *${source}* disponibles en este grupo — todos tienen dueño.`,
        edit: key,
      } as any)
      return
    }

    const char = pickRandom(available)

    // registrar cooldown
    rwCooldowns.set(sender, Date.now())

    // descargar imagen
    let buffer: Buffer | null = null
    try {
      buffer = await downloadBuffer(pickImage(char.image))
    } catch {}

    // getGroupClaim ya excluyó arriba a cualquier personaje con dueño en este
    // grupo, así que acá SIEMPRE va a dar null — pero se resuelve igual (en
    // vez de asumirlo) para que este caption use la misma lógica real que
    // #winfo, no el campo estático "Libre" que trae el JSON de la fuente.
    const ownerJid  = getGroupClaim(jid, char)
    const estadoStr = ownerJid ? `Reclamado por ${ownerName(ownerJid)}` : (char.status ?? 'Libre')

    const caption = [
      `◈ Nombre ⇝ *${char.name}*`,
      `⚥ Genero ⇝ *${char.gender}*`,
      `☆ Valor  ⇝ *${char.value}*`,
      `♡ Estado ⇝ *${estadoStr}*`,
      `◆ Fuente ⇝ *${char.source}*`,
    ].join('\n')

    const mentions = ownerJid ? [ownerJid] : []

    let sentImg: any = null
    if (buffer) {
      sentImg = await sock.sendMessage(jid, { image: buffer, caption, mentions })
    } else {
      sentImg = await sock.sendMessage(jid, { text: caption, mentions })
    }

    // registrar personaje activo
    const expiresAt = Date.now() + 10 * 60 * 1000
    setUserActiveChar(jid, sender, {
      char,
      rolledBy:  sender,
      jid,
      expiresAt,
      claimedBy: null,
      claimedAt: null,
      stealEnds: null,
      msgKey:    sentImg?.key ?? null,
    })

    setTimeout(() => {
      const active = getUserActiveChar(jid, sender)
      if (active?.char.name === char.name && !active.claimedBy) {
        deleteUserActiveChar(jid, sender)
      }
    }, 10 * 60 * 1000)
  },
}

export default command
