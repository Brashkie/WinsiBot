import { pythonPost, pythonGet } from '@lib/pythonBridge.js'
import { hepein }               from '@lib/hepein.js'

export const MODES = [
  'amable',
  'alegre',
  'toxico',
  'sarcastico',
  'formal',
  'misterioso',
  // nuevos v8.1
  'peruano',
  'gamer',
  'amoroso',
  'chistoso',
  'depresivo',
  'kawaii',
] as const

export type PersonalityMode = typeof MODES[number]

export const MODE_DESCRIPTIONS: Record<PersonalityMode, string> = {
  amable:     'Amigable y servicial 😊',
  alegre:     'Energético y entusiasta 🎉',
  toxico:     'Sarcástico extremo 💀',
  sarcastico: 'Ironía y burlas suaves 😏',
  formal:     'Profesional y educado 👔',
  misterioso: 'Críptico y filosófico 🌙',
  // nuevos v8.1
  peruano:    'Jerga peruana: causa, pe, bro, oe 🇵🇪',
  gamer:      'Términos gaming: GG, lag, noob, meta 🎮',
  amoroso:    'Cariñoso con emojis de corazón ❤️',
  chistoso:   'Chistes y observaciones cómicas 😂',
  depresivo:  'Apático y nihilista 😶',
  kawaii:     'Estilo anime: uwu, owo, ~nyan 🌸',
}

interface PersonalityModeResponse {
  current:     string
  modes:       string[]
  group_modes: Record<string, string>
}

// ─── Bridge a Flask/Python ────────────────────────────────────────────────────

export async function getMode(jid?: string): Promise<PersonalityMode> {
  try {
    const res = await pythonGet<PersonalityModeResponse>('/api/v1/ai/personality/mode')
    const mode = jid
      ? res?.data?.group_modes?.[jid] ?? res?.data?.current
      : res?.data?.current
    return (MODES.includes(mode as PersonalityMode) ? mode : 'amable') as PersonalityMode
  } catch {
    return 'amable'
  }
}

export async function setMode(mode: PersonalityMode, jid?: string): Promise<boolean> {
  try {
    const res = await pythonPost<{ success: boolean }>('/api/v1/ai/personality/mode', {
      mode,
      jid: jid ?? null,
    })
    return res?.data?.success ?? false
  } catch {
    return false
  }
}

export async function resetMode(jid?: string): Promise<boolean> {
  try {
    const res = await pythonPost<{ success: boolean }>('/api/v1/ai/personality/reset', {
      jid: jid ?? null,
    })
    return res?.data?.success ?? false
  } catch {
    return false
  }
}

export async function getAllModes(): Promise<{ global: string; groups: Record<string, string> }> {
  try {
    const res = await pythonGet<PersonalityModeResponse>(
      '/api/v1/ai/personality/mode'
    )
    return {
      global: res?.data?.current ?? 'amable',
      groups: res?.data?.group_modes ?? {},
    }
  } catch {
    return { global: 'amable', groups: {} }
  }
}

/**
 * Registra un mensaje en el pipeline de entrenamiento Hepein.
 * Fire-and-forget — no bloquea el handler.
 */
export function recordMessage(
  groupJid:  string,
  senderJid: string,
  text:      string,
  isReply    = false,
): void {
  hepein.record({ groupJid, senderJid, text, isReply })
}

/**
 * Obtiene el modo activo del grupo y su perfil de estilo aprendido
 * en paralelo, para usarlos juntos al construir respuestas.
 */
export async function getModeWithProfile(
  groupJid:  string,
  senderJid: string,
): Promise<{ mode: PersonalityMode; hasProfile: boolean; msgCount: number }> {
  const [mode, profile] = await Promise.all([
    getMode(groupJid),
    hepein.getProfile(senderJid),
  ])
  return {
    mode,
    hasProfile: (profile?.msg_count ?? 0) >= 15,
    msgCount:   profile?.msg_count ?? 0,
  }
}
