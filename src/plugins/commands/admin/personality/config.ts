import {
  getPersonalityModes, setPersonalityMode, resetPersonalityMode,
} from '@lib/nativeBridge.js'

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

// ─── Bridge a Rust ────────────────────────────────────────────────────────────
// Los modos los guarda personality.rs en la misma base que el resto, en vez de
// la tabla `personality_config` que Python creaba en su propio SQLite.

export async function getMode(jid?: string): Promise<PersonalityMode> {
  try {
    const res = await getPersonalityModes()
    const mode = jid ? res?.group_modes?.[jid] ?? res?.current : res?.current
    return (MODES.includes(mode as PersonalityMode) ? mode : 'amable') as PersonalityMode
  } catch {
    return 'amable'
  }
}

export async function setMode(mode: PersonalityMode, jid?: string): Promise<boolean> {
  try {
    return await setPersonalityMode(mode, jid ?? '')
  } catch {
    return false
  }
}

export async function resetMode(jid?: string): Promise<boolean> {
  try {
    return await resetPersonalityMode(jid ?? '')
  } catch {
    return false
  }
}

export async function getAllModes(): Promise<{ global: string; groups: Record<string, string> }> {
  try {
    const res = await getPersonalityModes()
    return {
      global: res?.current ?? 'amable',
      groups: res?.group_modes ?? {},
    }
  } catch {
    return { global: 'amable', groups: {} }
  }
}
