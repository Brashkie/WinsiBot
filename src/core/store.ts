// Creado por Hepein Oficial x HepeinBaileys

import type { WASocket, Contact } from '@whiskeysockets/baileys'
import { writeFile, readFile, mkdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { logger } from './logger.js'
import { setGroupMetadata } from './groupCache.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface StoreContact {
  id:      string
  name?:   string
  notify?: string
  lid?:    string
}

interface ExtendedContact extends Contact {
  lid?: string
}

interface ExtendedParticipant {
  id:    string
  admin: string | null
  lid?:  string
}

interface StoreData {
  contacts: Record<string, StoreContact>
  chats:    Record<string, { id: string; name?: string }>
  messages: Record<string, any[]>
}

// Máximo de mensajes a mantener por chat privado.
// Los mensajes de grupos NO se almacenan — son voluminosos y la mayoría de
// comandos no necesita historial; solo usan el mensaje actual del contexto.
const MAX_MSGS_PER_CHAT = 20
// Rotar contactos cuando superan este límite (LRU aproximado)
const MAX_CONTACTS      = 20_000

// ─── Store ────────────────────────────────────────────────────────────────────
class WinsiStore {
  private data: StoreData = {
    contacts: {},
    chats:    {},
    messages: {},
  }

  private lidMap  = new Map<string, string>()
  private nameMap = new Map<string, string>()

  // Coalescing + debounce para preloadGroup: una ráfaga de eventos del mismo
  // grupo (p. ej. varios group-participants.update seguidos) colapsa en un
  // solo fetch de groupMetadata en vez de uno por evento.
  private preloadTimers   = new Map<string, ReturnType<typeof setTimeout>>()
  private preloadInFlight = new Map<string, Promise<void>>()

  private dirty        = false
  private writing      = false
  private saveTimeout: ReturnType<typeof setTimeout>  | null = null
  private saveInterval: ReturnType<typeof setInterval> | null = null

  private readonly path    = './data/store.json'
  private readonly pathTmp = './data/store.json.tmp'

  // ─── Persistencia ───────────────────────────────────────────────────────────

  async load(): Promise<void> {
    try {
      if (!existsSync(this.path)) return
      const raw = await readFile(this.path, 'utf-8')
      this.data = JSON.parse(raw)

      for (const [jid, c] of Object.entries(this.data.contacts)) {
        if (c.name || c.notify) this.nameMap.set(jid, c.name ?? c.notify ?? '')
        if (c.lid)              this.lidMap.set(c.lid, jid)
      }
    } catch (err) {
      logger.error({ err }, 'Store: error al cargar')
    }
  }

  async save(): Promise<void> {
    if (!this.dirty || this.writing) return
    this.writing = true
    try {
      await mkdir('./data', { recursive: true })
      // Escritura atómica: escribir en .tmp → renombrar → reemplaza el original
      // Previene store.json corrupto si el proceso muere en mitad de la escritura.
      await writeFile(this.pathTmp, JSON.stringify(this.data))
      await rename(this.pathTmp, this.path)
      this.dirty = false
    } catch (err) {
      logger.error({ err }, 'Store: error al guardar')
    } finally {
      this.writing = false
    }
  }

  private scheduleSave(): void {
    this.dirty = true
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    // Debounce de 30s — evita un write por cada mensaje en grupos activos
    this.saveTimeout = setTimeout(() => this.save(), 30_000)
  }

  // ─── Registrar contacto ─────────────────────────────────────────────────────
  private registerContact(id: string, name?: string, lid?: string): void {
    const existing = this.data.contacts[id] ?? { id }

    const updated: StoreContact = {
      id,
      ...(name ?? existing.name   ? { name:   name ?? existing.name }   : {}),
      ...(name ?? existing.notify ? { notify: name ?? existing.notify } : {}),
      ...(lid  ?? existing.lid    ? { lid:    lid  ?? existing.lid }    : {}),
    }

    this.data.contacts[id] = updated

    if (name) this.nameMap.set(id, name)
    if (lid) {
      this.lidMap.set(lid, id)
      this.data.contacts[lid] = { id, lid }
    }

    this.scheduleSave()
  }

  // ─── Rotar contactos cuando la tabla crece demasiado ───────────────────────
  private trimContacts(): void {
    const keys = Object.keys(this.data.contacts)
    if (keys.length <= MAX_CONTACTS) return
    const excess = keys.length - MAX_CONTACTS
    for (const k of keys.slice(0, excess)) {
      delete this.data.contacts[k]
      this.nameMap.delete(k)
      this.lidMap.delete(k)
    }
  }

  // ─── Precargar desde datos ya obtenidos (sin request extra) ────────────────
  preloadFromData(groupJid: string, metadata: any): void {
    try {
      for (const p of (metadata.participants ?? []) as ExtendedParticipant[]) {
        this.registerContact(p.id, undefined, p.lid)
      }
      this.data.chats[groupJid] = {
        id: groupJid,
        ...(metadata.subject ? { name: metadata.subject } : {}),
      }
      this.scheduleSave()
    } catch (err) {
      logger.warn({ err }, 'Store: error en preloadFromData')
    }
  }

  // ─── Precargar grupo con request (coalescing) ──────────────────────────────
  async preloadGroup(sock: WASocket, groupJid: string): Promise<void> {
    const inFlight = this.preloadInFlight.get(groupJid)
    if (inFlight) return inFlight

    const run = (async () => {
      try {
        const metadata = await sock.groupMetadata(groupJid)
        this.preloadFromData(groupJid, metadata)
        setGroupMetadata(groupJid, metadata)
      } catch (err) {
        logger.debug({ err }, 'Store: no se pudo precargar grupo')
      } finally {
        this.preloadInFlight.delete(groupJid)
      }
    })()

    this.preloadInFlight.set(groupJid, run)
    return run
  }

  /** Debounce ~2s — colapsa ráfagas de eventos del mismo grupo en un solo fetch. */
  schedulePreloadGroup(sock: WASocket, groupJid: string): void {
    const existing = this.preloadTimers.get(groupJid)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.preloadTimers.delete(groupJid)
      void this.preloadGroup(sock, groupJid)
    }, 2_000)
    timer.unref()
    this.preloadTimers.set(groupJid, timer)
  }

  // ─── Bind a eventos de Baileys ──────────────────────────────────────────────
  bind(sock: WASocket): void {
    sock.ev.on('contacts.update', (updates) => {
      for (const c of updates as ExtendedContact[]) {
        if (!c.id) continue
        this.registerContact(c.id, c.name ?? c.notify, c.lid)
      }
    })

    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        this.data.chats[chat.id] = {
          id: chat.id,
          ...((chat as any).name ?? (chat as any).subject
            ? { name: (chat as any).name ?? (chat as any).subject }
            : {}),
        }
      }
      this.scheduleSave()
    })

    sock.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        const sender   = msg.key.participant ?? msg.key.remoteJid ?? ''
        const pushName = msg.pushName ?? ''

        if (sender && pushName) {
          this.registerContact(sender, pushName)

          if (sender.includes('@lid')) {
            const num = sender.replace('@lid', '').replace(/[^0-9]/g, '')
            if (num) {
              const normalJid = `${num}@s.whatsapp.net`
              this.lidMap.set(sender, normalJid)
              this.nameMap.set(normalJid, pushName)
              this.registerContact(normalJid, pushName, sender)
            }
          }
        }

        // Solo cachear historial en chats privados — los grupos son voluminosos
        // y los comandos usan el mensaje del contexto actual, no el historial.
        const chatId = msg.key.remoteJid ?? ''
        if (chatId && !chatId.endsWith('@g.us')) {
          if (!this.data.messages[chatId]) this.data.messages[chatId] = []
          this.data.messages[chatId].push(msg)
          if (this.data.messages[chatId].length > MAX_MSGS_PER_CHAT) {
            this.data.messages[chatId] = this.data.messages[chatId].slice(-MAX_MSGS_PER_CHAT)
          }
          this.scheduleSave()
        }
      }

      // Rotar si la tabla de contactos creció mucho
      if (Object.keys(this.data.contacts).length > MAX_CONTACTS) {
        this.trimContacts()
      }
    })

    sock.ev.on('groups.update', (updates) => {
      for (const update of updates) {
        if (update.id) this.schedulePreloadGroup(sock, update.id)
      }
    })

    sock.ev.on('group-participants.update', ({ id }) => {
      this.schedulePreloadGroup(sock, id)
    })

    if (this.saveInterval) clearInterval(this.saveInterval)
    // Background save cada 60s — la escritura atómica lo hace seguro
    this.saveInterval = setInterval(() => {
      if (this.dirty) this.save()
    }, 60_000)
    this.saveInterval.unref()
  }

  // ─── Resolver JID ───────────────────────────────────────────────────────────
  resolveJid(id: string): { jid: string; name: string } {
    if (!id) return { jid: id, name: '' }

    if (id.endsWith('@s.whatsapp.net')) {
      return { jid: id, name: this.nameMap.get(id) ?? id.replace('@s.whatsapp.net', '') }
    }

    const mapped = this.lidMap.get(id)
    if (mapped) {
      return { jid: mapped, name: this.nameMap.get(mapped) ?? mapped.replace('@s.whatsapp.net', '') }
    }

    const contact = this.data.contacts[id]
    if (contact) {
      const jid  = contact.id.endsWith('@s.whatsapp.net')
        ? contact.id
        : `${contact.id.replace(/[^0-9]/g, '')}@s.whatsapp.net`
      const name = contact.name ?? contact.notify ?? this.nameMap.get(jid) ?? jid.replace('@s.whatsapp.net', '')
      return { jid, name }
    }

    const num         = id.replace('@lid', '').replace(/[^0-9]/g, '')
    const fallbackJid = `${num}@s.whatsapp.net`
    return { jid: fallbackJid, name: this.nameMap.get(fallbackJid) ?? num }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────
  getContact(jid: string): StoreContact | undefined {
    return this.data.contacts[jid]
  }

  getName(jid: string): string {
    return this.nameMap.get(jid)
      ?? this.data.contacts[jid]?.name
      ?? this.data.contacts[jid]?.notify
      ?? jid.replace('@s.whatsapp.net', '').replace('@lid', '')
  }

  getMessages(chatId: string): any[] {
    return this.data.messages[chatId] ?? []
  }

  get contacts() { return this.data.contacts }
  get chats()    { return this.data.chats    }
}

export const winsiStore = new WinsiStore()
