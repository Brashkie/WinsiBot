import { pythonPost, pythonGet } from '@lib/pythonBridge.js'

export const MODES = [
  'amable',
  'alegre',
  'toxico',
  'sarcastico',
  'formal',
  'misterioso',
] as const

export type PersonalityMode = typeof MODES[number]

export const MODE_DESCRIPTIONS: Record<PersonalityMode, string> = {
  amable:     'Amigable y servicial 😊',
  alegre:     'Energético y entusiasta 🎉',
  toxico:     'Sarcástico extremo 💀',
  sarcastico: 'Ironía y burlas suaves 😏',
  formal:     'Profesional y educado 👔',
  misterioso: 'Críptico y filosófico 🌙',
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