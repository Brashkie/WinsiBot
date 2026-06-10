// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — PERSISTENCIA SQLite (better-sqlite3)
//
//  Guarda en disco los Maps en memoria (userData, groupConfigs, clanData) para
//  que no se pierdan al reiniciar. Usa WAL para escrituras sin bloqueo.
//
//  Uso rápido:
//    import { db } from '@lib/db.js'
//    db.loadAll()          // al inicio del bot
//    db.markDirty()        // después de cada write en userData / groupConfigs
//    db.saveAll()          // forzar guardado inmediato
// ─────────────────────────────────────────────────────────────────────────────

import BetterSqlite3 from 'better-sqlite3'
import { mkdirSync }  from 'fs'
import { logger }     from '../core/logger.js'
import {
  userData,
  groupConfigs,
  clanData,
  userClan,
  type UserData,
  type GroupConfig,
  type ClanData,
} from '../core/events.js'

// ─────────────────────────────────────────────────────────────────────────────
//  ESQUEMA
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = /* sql */`
  CREATE TABLE IF NOT EXISTS users (
    jid        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS groups (
    jid        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS clans (
    tag        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_clan (
    jid TEXT PRIMARY KEY,
    tag TEXT NOT NULL
  );

  -- KV genérico para guardar cualquier dato extra
  CREATE TABLE IF NOT EXISTS kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );
`

// ─────────────────────────────────────────────────────────────────────────────
//  CLASE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

class WinsiDB {
  private sql:       BetterSqlite3.Database
  private timer:     ReturnType<typeof setTimeout>  | null = null
  private interval:  ReturnType<typeof setInterval> | null = null
  private _dirty = false

  constructor(path = './data/winsi.db') {
    mkdirSync('./data', { recursive: true })

    this.sql = new BetterSqlite3(path)
    this.sql.pragma('journal_mode = WAL')
    this.sql.pragma('synchronous = NORMAL')
    this.sql.pragma('foreign_keys = ON')
    this.sql.exec(SCHEMA)

    // Guardar cada 60 s en background
    this.interval = setInterval(() => {
      if (this._dirty) this.saveAll()
    }, 60_000)
    this.interval.unref()

    logger.info('DB SQLite lista → ./data/winsi.db')
  }

  // ─── Carga completa al iniciar ────────────────────────────────────────────

  loadAll(): void {
    let u = 0, g = 0, c = 0

    try {
      const rows = this.sql.prepare('SELECT jid, data FROM users').all() as { jid: string; data: string }[]
      for (const row of rows) {
        try { userData.set(row.jid, JSON.parse(row.data) as UserData); u++ } catch {}
      }
    } catch (err) { logger.error({ err }, 'DB: error cargando users') }

    try {
      const rows = this.sql.prepare('SELECT jid, data FROM groups').all() as { jid: string; data: string }[]
      for (const row of rows) {
        try { groupConfigs.set(row.jid, JSON.parse(row.data) as GroupConfig); g++ } catch {}
      }
    } catch (err) { logger.error({ err }, 'DB: error cargando grupos') }

    try {
      const rows = this.sql.prepare('SELECT tag, data FROM clans').all() as { tag: string; data: string }[]
      for (const row of rows) {
        try { clanData.set(row.tag, JSON.parse(row.data) as ClanData); c++ } catch {}
      }
    } catch (err) { logger.error({ err }, 'DB: error cargando clanes') }

    try {
      const rows = this.sql.prepare('SELECT jid, tag FROM user_clan').all() as { jid: string; tag: string }[]
      for (const row of rows) { userClan.set(row.jid, row.tag) }
    } catch (err) { logger.error({ err }, 'DB: error cargando user_clan') }

    logger.info(`DB cargado → ${u} usuarios · ${g} grupos · ${c} clanes`)
  }

  // ─── Guardado completo ────────────────────────────────────────────────────

  saveAll(): void {
    const stmtUser  = this.sql.prepare('INSERT OR REPLACE INTO users (jid, data, updated_at) VALUES (?, ?, unixepoch())')
    const stmtGroup = this.sql.prepare('INSERT OR REPLACE INTO groups (jid, data, updated_at) VALUES (?, ?, unixepoch())')
    const stmtClan  = this.sql.prepare('INSERT OR REPLACE INTO clans (tag, data, updated_at) VALUES (?, ?, unixepoch())')
    const stmtUC    = this.sql.prepare('INSERT OR REPLACE INTO user_clan (jid, tag) VALUES (?, ?)')

    const tx = this.sql.transaction(() => {
      for (const [jid, data] of userData)     stmtUser.run(jid, JSON.stringify(data))
      for (const [jid, data] of groupConfigs) stmtGroup.run(jid, JSON.stringify(data))
      for (const [tag, data] of clanData)     stmtClan.run(tag, JSON.stringify(data))
      for (const [jid, tag]  of userClan)     stmtUC.run(jid, tag)
    })

    try {
      tx()
      this._dirty = false
    } catch (err) {
      logger.error({ err }, 'DB: error al guardar')
    }
  }

  // ─── Guardado de un usuario individual ───────────────────────────────────

  saveUser(jid: string): void {
    const data = userData.get(jid)
    if (!data) return
    try {
      this.sql
        .prepare('INSERT OR REPLACE INTO users (jid, data, updated_at) VALUES (?, ?, unixepoch())')
        .run(jid, JSON.stringify(data))
    } catch (err) {
      logger.error({ err }, `DB: error guardando usuario ${jid}`)
    }
  }

  // ─── Guardado de un grupo individual ─────────────────────────────────────

  saveGroup(jid: string): void {
    const data = groupConfigs.get(jid)
    if (!data) return
    try {
      this.sql
        .prepare('INSERT OR REPLACE INTO groups (jid, data, updated_at) VALUES (?, ?, unixepoch())')
        .run(jid, JSON.stringify(data))
    } catch (err) {
      logger.error({ err }, `DB: error guardando grupo ${jid}`)
    }
  }

  // ─── Debounce: marcar sucio para el próximo ciclo ─────────────────────────

  markDirty(delaySec = 30): void {
    this._dirty = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.saveAll(), delaySec * 1_000)
  }

  get isDirty(): boolean { return this._dirty }

  // ─────────────────────────────────────────────────────────────────────────
  //  KV GENÉRICO
  // ─────────────────────────────────────────────────────────────────────────

  kvGet<T = unknown>(key: string): T | null {
    const row = this.sql.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
    if (!row) return null
    try { return JSON.parse(row.value) as T } catch { return null }
  }

  kvSet(key: string, value: unknown): void {
    this.sql
      .prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, unixepoch())')
      .run(key, JSON.stringify(value))
  }

  kvDelete(key: string): void {
    this.sql.prepare('DELETE FROM kv WHERE key = ?').run(key)
  }

  /** Devuelve todos los pares cuya clave empiece por `prefix`. */
  kvPrefix<T = unknown>(prefix: string): Map<string, T> {
    const rows = this.sql
      .prepare("SELECT key, value FROM kv WHERE key LIKE ?")
      .all(`${prefix}%`) as { key: string; value: string }[]

    const result = new Map<string, T>()
    for (const row of rows) {
      try { result.set(row.key, JSON.parse(row.value) as T) } catch {}
    }
    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  ESTADÍSTICAS
  // ─────────────────────────────────────────────────────────────────────────

  stats(): { users: number; groups: number; clans: number; kv: number } {
    const cnt = (table: string) =>
      (this.sql.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n
    return {
      users:  cnt('users'),
      groups: cnt('groups'),
      clans:  cnt('clans'),
      kv:     cnt('kv'),
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  BACKUP MANUAL
  // ─────────────────────────────────────────────────────────────────────────

  async backup(destPath: string): Promise<void> {
    await (this.sql as any).backup(destPath)
    logger.info(`DB backup → ${destPath}`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CIERRE LIMPIO
  // ─────────────────────────────────────────────────────────────────────────

  close(): void {
    if (this.timer)    clearTimeout(this.timer)
    if (this.interval) clearInterval(this.interval)
    if (this._dirty)   this.saveAll()
    this.sql.close()
    logger.info('DB cerrada correctamente')
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const db = new WinsiDB()

// Solo 'exit' — NUNCA manejar SIGINT/SIGTERM aquí.
// index.ts tiene el shutdown completo (saveAll, cerrar subbots, etc.).
// 'exit' se dispara siempre al final, sin importar cómo salió el proceso.
process.once('exit', () => db.close())
