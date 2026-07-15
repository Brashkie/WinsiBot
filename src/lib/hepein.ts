// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — CLIENTE HEPEIN
//  Conecta TypeScript con el pipeline Python: Parquet + DuckDB + IA.
//
//  Uso rápido:
//    import { hepein } from '@lib/hepein.js'
//
//    // En el handler de mensajes, para entrenar (fire-and-forget):
//    hepein.record({ groupJid, senderJid, text, isReply })
//
//    // Cuando el bot es mencionado (hepein activado en el grupo):
//    const res = await hepein.respond({ prompt, groupJid, senderJid })
//    if (res.ok) sock.sendMessage(jid, { text: res.text })
//
//    // Imitar a un usuario:
//    const res = await hepein.imitate({ prompt, targetJid, groupJid, senderJid })
// ─────────────────────────────────────────────────────────────────────────────

import { pythonPost, pythonGet, pythonDelete } from './pythonBridge.js'
import { logger } from '../core/logger.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UserStyleProfile {
  jid:          string
  msg_count:    number
  avg_len:      number
  emoji_freq:   number
  common_words: string[]
  active_hours: number[]
  vocab_sample: string[]
  uses_slang:   boolean
}

export interface GroupStyleProfile {
  group_jid:    string
  msg_count:    number
  active_users: string[]
  common_words: string[]
  avg_msg_len:  number
  emoji_freq:   number
  vocab_sample: string[]
  topics:       string[]
}

export interface HepeinResponse {
  ok:         boolean
  text:       string
  mode:       string
  hasProfile: boolean
  groupMsgs:  number
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

  /**
   * Registra un mensaje en el pipeline de entrenamiento.
   * Fire-and-forget — no bloquea el handler.
   */
  record(opts: {
    groupJid:  string
    senderJid: string
    text:      string
    isReply?:  boolean
  }): void {
    const { groupJid, senderJid, text, isReply = false } = opts
    if (!text?.trim() || text.length < 3) return
    pythonPost('/api/v1/hepein/record', {
      group_jid:  groupJid,
      sender_jid: senderJid,
      text,
      is_reply:   isReply,
    }).catch(err => logger.debug({ err }, 'Hepein record silenciado'))
  },

  /**
   * Actualiza la reputación/comportamiento del usuario (user_memory.py).
   * Fire-and-forget — no bloquea el handler.
   */
  updateMemory(jid: string, text: string, intent: string, isCmd = false): void {
    if (!jid || !text?.trim()) return
    pythonPost(`/api/v1/ai/memory/${encodeURIComponent(jid)}/update`, {
      text,
      intent,
      is_cmd: isCmd,
    }).catch(err => logger.debug({ err }, 'user_memory update silenciado'))
  },

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
    model?:     string   // modelo Ollama específico (según la palabra disparadora) — sin cascada a GPT/Claude/Gemini
    useGpt?:    boolean
    useHumor?:  boolean
    force?:     boolean   // omitir cooldown
  }): Promise<HepeinResponse> {
    const {
      prompt, groupJid, senderJid,
      intent   = 'neutral',
      useGpt   = true,
      useHumor = false,
      force    = false,
    } = opts

    if (!force && !_canRespond(groupJid)) {
      return { ok: false, text: '', mode: '', hasProfile: false, groupMsgs: 0, error: 'cooldown' }
    }

    const res = await pythonPost<{
      text:        string
      mode:        string
      has_profile: boolean
      group_msgs:  number
    }>('/api/v1/hepein/respond', {
      prompt,
      group_jid:  groupJid,
      sender_jid: senderJid,
      intent,
      use_gpt:    useGpt,
      use_humor:  useHumor,
      ...(opts.mode  ? { mode: opts.mode }   : {}),
      ...(opts.model ? { model: opts.model } : {}),
    }, 15_000) // más generoso que el default (5s) — puede pasar por Ollama antes de GPT/Claude/Gemini

    if (!res.success || !res.data?.text) {
      return { ok: false, text: '', mode: '', hasProfile: false, groupMsgs: 0, error: res.error }
    }

    return {
      ok:         true,
      text:       res.data.text,
      mode:       res.data.mode,
      hasProfile: res.data.has_profile,
      groupMsgs:  res.data.group_msgs,
      error:      undefined,
    }
  },

  /**
   * Genera una respuesta imitando el estilo de un usuario concreto.
   */
  async imitate(opts: {
    prompt:    string
    targetJid: string
    groupJid:  string
    senderJid: string
  }): Promise<ImitateResponse> {
    const res = await pythonPost<{
      text:        string
      has_profile: boolean
      msg_count:   number
    }>('/api/v1/hepein/imitate', {
      prompt:      opts.prompt,
      target_jid:  opts.targetJid,
      group_jid:   opts.groupJid,
      sender_jid:  opts.senderJid,
    })

    if (!res.success || !res.data?.text) {
      return { ok: false, text: '', hasProfile: false, msgCount: 0, error: res.error }
    }

    return {
      ok:         true,
      text:       res.data.text,
      hasProfile: res.data.has_profile,
      msgCount:   res.data.msg_count,
      error:      undefined,
    }
  },

  /**
   * Devuelve el perfil de estilo aprendido de un usuario.
   */
  async getProfile(jid: string, days = 45): Promise<UserStyleProfile | null> {
    const res = await pythonGet<UserStyleProfile>(`/api/v1/hepein/profile/${encodeURIComponent(jid)}`, {
      days: String(days),
    })
    return res.success && res.data ? res.data : null
  },

  /**
   * Devuelve el perfil de estilo aprendido de un grupo.
   */
  async getGroupStyle(groupJid: string, days = 30): Promise<GroupStyleProfile | null> {
    const res = await pythonGet<GroupStyleProfile>(`/api/v1/hepein/group/${encodeURIComponent(groupJid)}`, {
      days: String(days),
    })
    return res.success && res.data ? res.data : null
  },

  /**
   * Elimina todos los datos de mensajes de un usuario (privacidad).
   */
  async deleteProfile(jid: string): Promise<{ deletedRows: number }> {
    const res = await pythonDelete<{ deleted_rows: number }>(`/api/v1/hepein/profile/${encodeURIComponent(jid)}`)
    return { deletedRows: res.data?.deleted_rows ?? 0 }
  },

  /**
   * Estadísticas del pipeline Parquet.
   */
  async stats(): Promise<{ parquetFiles: number; diskMb: number; bufferPending: number } | null> {
    const res = await pythonGet<{ parquet_files: number; disk_mb: number; buffer_pending: number }>(
      '/api/v1/hepein/stats'
    )
    if (!res.success || !res.data) return null
    return {
      parquetFiles:  res.data.parquet_files,
      diskMb:        res.data.disk_mb,
      bufferPending: res.data.buffer_pending,
    }
  },
}

