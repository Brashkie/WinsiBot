// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — CLIENTE HEPEIN
//
//  Python se quedó solo con lo que de verdad necesita Python: hablar con Ollama
//  y adaptar el texto. Los perfiles de estilo —de usuario y de grupo— salen de
//  Rust, de la tabla `conversations` que ya se llenaba en cada respuesta de IA.
//
//  Antes había DOS almacenes calculando el mismo perfil: Rust escribía en
//  `conversations` + `user_style`, y acá se mandaba el mismo mensaje a
//  `/hepein/record` para que trainer.py lo guardara otra vez en Parquet y lo
//  consultara con DuckDB. Dos copias de cada mensaje, dos implementaciones de
//  las mismas agregaciones, y una llamada HTTP a Python por cada mensaje de
//  grupo que ya dábamos por eliminada.
//
//  Al irse trainer.py se van con él `pyarrow` y `duckdb`, que eran dos de las
//  cuatro dependencias Python que compilan desde fuente en Termux.
//
//  Uso rápido:
//    import { hepein } from '@lib/hepein.js'
//
//    // Cuando el bot es mencionado (hepein activado en el grupo):
//    const res = await hepein.respond({ prompt, groupJid, senderJid })
//    if (res.ok) sock.sendMessage(jid, { text: res.text })
//
//    // Imitar a un usuario:
//    const res = await hepein.imitate({ prompt, targetJid })
// ─────────────────────────────────────────────────────────────────────────────

import {
  getUserStyle, getGroupStyle,
  deleteUserStyle, getCorpusStats,
  aiRespond, aiImitate,
  type UserStyleProfile, type GroupStyleProfile,
} from './nativeBridge.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

// UserStyleProfile y GroupStyleProfile se re-exportan: los definía este
// archivo cuando los producía Python, y ahora los produce Rust.
export type { UserStyleProfile, GroupStyleProfile }

export interface HepeinResponse {
  ok:         boolean
  text:       string
  mode:       string
  hasProfile: boolean
  groupMsgs:  number
  /** 'ia' si contestó un modelo, 'plantilla' si fue el motor local de Rust. */
  source?:    'ia' | 'plantilla'
  error:      string | undefined
}

export interface ImitateResponse {
  ok:         boolean
  text:       string
  hasProfile: boolean
  msgCount:   number
  error:      string | undefined
}

// ─── Rate limiting por grupo ──────────────────────────────────────────────────
// Evita que hepein spamee si el bot es mencionado muy seguido

const _respondBuckets = new Map<string, number>()
const RESPOND_COOLDOWN_MS = 4_000

function _canRespond(groupJid: string): boolean {
  const last = _respondBuckets.get(groupJid) ?? 0
  const now  = Date.now()
  if (now - last < RESPOND_COOLDOWN_MS) return false
  _respondBuckets.set(groupJid, now)
  return true
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const hepein = {

  // `record` ya no está: cada mensaje de grupo lo guarda `ingerirMensaje` en
  // un solo viaje (ver core/handler.ts y crates/session-api/src/ingest.rs).

  /**
   * Genera una respuesta contextual usando el estilo aprendido del grupo.
   * Respeta un cooldown de 4 s por grupo para no spamear.
   */
  async respond(opts: {
    prompt:     string
    groupJid:   string
    senderJid:  string
    intent?:    string
    mode?:      string
    model?:     string   // modelo Ollama concreto (según la palabra disparadora)
    useGpt?:    boolean
    useHumor?:  boolean
    force?:     boolean  // omitir el cooldown por grupo
    history?:   Array<{ reply: string }>
    comandos?:  string   // los comandos que sirven, si preguntó por el bot
  }): Promise<HepeinResponse> {
    const { groupJid, force = false } = opts
    if (!force && !_canRespond(groupJid)) {
      return { ok: false, text: '', mode: '', hasProfile: false, groupMsgs: 0, error: 'cooldown' }
    }

    // Rust resuelve el camino entero: perfiles, prompt, Ollama, APIs cloud y,
    // si ninguna responde, el motor local de plantillas.
    // Las opcionales van con spread y no como `campo: undefined`, porque el
    // proyecto compila con `exactOptionalPropertyTypes`: ahí "ausente" y
    // "presente pero undefined" no son lo mismo.
    const r = await aiRespond({
      prompt:    opts.prompt,
      groupJid,
      senderJid: opts.senderJid,
      ...(opts.intent   !== undefined ? { intent:   opts.intent }   : {}),
      ...(opts.mode     !== undefined ? { mode:     opts.mode }     : {}),
      ...(opts.model    !== undefined ? { model:    opts.model }    : {}),
      ...(opts.useGpt   !== undefined ? { useGpt:   opts.useGpt }   : {}),
      ...(opts.useHumor !== undefined ? { useHumor: opts.useHumor } : {}),
      ...(opts.history  !== undefined ? { history:  opts.history }  : {}),
      ...(opts.comandos !== undefined ? { comandos: opts.comandos } : {}),
    })

    if (!r) {
      return { ok: false, text: '', mode: '', hasProfile: false, groupMsgs: 0, error: 'sin respuesta' }
    }
    return {
      ok:         true,
      text:       r.text,
      mode:       r.mode,
      hasProfile: r.hasProfile,
      groupMsgs:  r.groupMsgs,
      source:     r.source,
      error:      undefined,
    }
  },

  /**
   * Genera una respuesta imitando el estilo de un usuario concreto.
   */
  async imitate(opts: {
    prompt:    string
    targetJid: string
  }): Promise<ImitateResponse> {
    const r = await aiImitate(opts.prompt, opts.targetJid)
    if (!r) {
      return { ok: false, text: '', hasProfile: false, msgCount: 0, error: 'sin respuesta' }
    }
    return { ok: true, text: r.text, hasProfile: r.hasProfile, msgCount: r.msgCount, error: undefined }
  },

  /**
   * Devuelve el perfil de estilo aprendido de un usuario.
   */
  getProfile(jid: string, days = 45): Promise<UserStyleProfile | null> {
    return getUserStyle(jid, days)
  },

  /**
   * Devuelve el perfil de estilo aprendido de un grupo.
   */
  getGroupStyle(groupJid: string, days = 30): Promise<GroupStyleProfile | null> {
    return getGroupStyle(groupJid, days)
  },

  /**
   * Elimina todos los mensajes guardados de un usuario (privacidad).
   */
  async deleteProfile(jid: string): Promise<{ deletedRows: number }> {
    return { deletedRows: await deleteUserStyle(jid) }
  },

  /**
   * Tamaño del corpus de aprendizaje.
   *
   * Antes contaba archivos Parquet y lo que quedaba en el buffer de trainer.py.
   * Ahora que es una tabla SQLite, lo informativo son las filas y a cuántos
   * usuarios y grupos cubren; `diskMb` sale del propio SQLite
   * (page_count * page_size), sin mirar el filesystem.
   */
  async stats(): Promise<{ rows: number; senders: number; groups: number; diskMb: number } | null> {
    const s = await getCorpusStats()
    if (!s) return null
    return { rows: s.rows, senders: s.senders, groups: s.groups, diskMb: s.disk_mb }
  },
}
