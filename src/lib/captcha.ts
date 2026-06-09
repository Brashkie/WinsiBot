// ─── Captcha Library ──────────────────────────────────────────────────────────

export type CaptchaType = 'math' | 'emoji' | 'pattern' | 'quiz'

export interface CaptchaChallenge {
  id:        string
  type:      CaptchaType
  question:  string
  answer:    string
  options?:  string[]
  expiresAt: number
  attempts:  number
  maxAttempts: number
}

export interface CaptchaResult {
  success:  boolean
  message:  string
  attempts: number
}

// ─── Math challenges ──────────────────────────────────────────────────────────

interface MathChallenge { question: string; answer: number }

const MATH_TYPES = [
  () => {
    const a = rand(1, 20), b = rand(1, 20)
    return { question: `¿Cuánto es ${a} + ${b}?`, answer: a + b }
  },
  () => {
    const a = rand(5, 30), b = rand(1, a)
    return { question: `¿Cuánto es ${a} - ${b}?`, answer: a - b }
  },
  () => {
    const a = rand(2, 12), b = rand(2, 12)
    return { question: `¿Cuánto es ${a} × ${b}?`, answer: a * b }
  },
  () => {
    const b = rand(2, 10), a = b * rand(2, 10)
    return { question: `¿Cuánto es ${a} ÷ ${b}?`, answer: a / b }
  },
  () => {
    const n = rand(2, 9)
    return { question: `¿Cuánto es ${n}²?`, answer: n * n }
  },
] as const

// ─── Emoji challenges ─────────────────────────────────────────────────────────

interface EmojiChallenge { question: string; answer: string; options: string[] }

const EMOJI_SETS = [
  { emoji: '🐶', name: 'perro',   options: ['gato','perro','pájaro','pez'] },
  { emoji: '🐱', name: 'gato',    options: ['gato','perro','conejo','pez'] },
  { emoji: '🌸', name: 'flor',    options: ['árbol','flor','hoja','fruta'] },
  { emoji: '🌙', name: 'luna',    options: ['sol','estrella','luna','nube'] },
  { emoji: '⭐', name: 'estrella', options: ['luna','sol','estrella','cometa'] },
  { emoji: '🍎', name: 'manzana', options: ['naranja','manzana','uva','pera'] },
  { emoji: '🎮', name: 'control', options: ['control','dados','pelota','carta'] },
  { emoji: '🚀', name: 'cohete',  options: ['avión','barco','cohete','tren'] },
  { emoji: '🏠', name: 'casa',    options: ['casa','tienda','escuela','hospital'] },
  { emoji: '🎵', name: 'música',  options: ['música','arte','deporte','cine'] },
]

function makeEmojiChallenge(): EmojiChallenge {
  const item = pick(EMOJI_SETS)!
  return {
    question: `¿Qué representa este emoji? ${item.emoji}`,
    answer:   item.name,
    options:  shuffle([...item.options]),
  }
}

// ─── Pattern challenges ───────────────────────────────────────────────────────

interface PatternChallenge { question: string; answer: string; options: string[] }

const PATTERNS = [
  { seq: '2, 4, 6, 8, ?',   answer: '10', options: ['10','9','12','11'] },
  { seq: '3, 6, 9, 12, ?',  answer: '15', options: ['15','13','18','14'] },
  { seq: '1, 4, 9, 16, ?',  answer: '25', options: ['25','20','30','24'] },
  { seq: '1, 1, 2, 3, 5, ?',answer: '8',  options: ['8','7','9','6'] },
  { seq: '2, 4, 8, 16, ?',  answer: '32', options: ['32','24','28','20'] },
  { seq: '5, 10, 15, 20, ?',answer: '25', options: ['25','22','30','28'] },
  { seq: '1, 3, 5, 7, ?',   answer: '9',  options: ['9','8','10','11'] },
  { seq: '100, 90, 80, 70, ?',answer:'60',options: ['60','50','70','65'] },
  { seq: '1, 2, 4, 8, 16, ?',answer:'32', options: ['32','24','48','16'] },
  { seq: '3, 9, 27, 81, ?', answer:'243', options: ['243','162','189','324'] },
]

function makePatternChallenge(): PatternChallenge {
  const p = pick(PATTERNS)!
  return {
    question: `Completa la secuencia: ${p.seq}`,
    answer:   p.answer,
    options:  shuffle([...p.options]),
  }
}

// ─── Quiz challenges ──────────────────────────────────────────────────────────

interface QuizChallenge { question: string; answer: string; options: string[] }

const QUIZ_ITEMS = [
  { q: '¿Cuál es el animal más grande del mundo?',   a: 'Ballena azul',    opts: ['Elefante','Tiburón ballena','Ballena azul','Hipopótamo'] },
  { q: '¿Cuántos colores tiene el arcoíris?',        a: '7',               opts: ['5','6','7','8'] },
  { q: '¿Cuántos planetas hay en el sistema solar?', a: '8',               opts: ['7','8','9','10'] },
  { q: '¿En qué continente está Brasil?',            a: 'América del Sur', opts: ['África','Europa','Asia','América del Sur'] },
  { q: '¿Cuántos lados tiene un hexágono?',          a: '6',               opts: ['4','5','6','8'] },
  { q: '¿Cuál es el idioma más hablado del mundo?',  a: 'Mandarín',        opts: ['Inglés','Español','Mandarín','Hindi'] },
  { q: '¿Cuántos metros tiene un kilómetro?',        a: '1000',            opts: ['100','500','1000','10000'] },
  { q: '¿Cuántos días tiene el año bisiesto?',       a: '366',             opts: ['365','366','367','364'] },
  { q: '¿Cuál es el país más grande del mundo?',     a: 'Rusia',           opts: ['China','Canadá','Rusia','Estados Unidos'] },
  { q: '¿Cuántos ángulos tiene un triángulo?',       a: '3',               opts: ['2','3','4','5'] },
]

function makeQuizChallenge(): QuizChallenge {
  const item = pick(QUIZ_ITEMS)!
  return {
    question: item.q,
    answer:   item.a,
    options:  shuffle([...item.opts]),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number)       { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick<T>(arr: readonly T[]): T        { return arr[Math.floor(Math.random() * arr.length)]! }
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}
function uid() { return Math.random().toString(36).slice(2, 10) }

// ─── Main classes ─────────────────────────────────────────────────────────────

export class CaptchaGenerator {
  private ttl:        number
  private maxAttempts: number

  constructor(ttlMs = 60_000, maxAttempts = 3) {
    this.ttl         = ttlMs
    this.maxAttempts = maxAttempts
  }

  generate(type?: CaptchaType): CaptchaChallenge {
    const t = type ?? pick<CaptchaType>(['math', 'emoji', 'pattern', 'quiz'])
    return this._build(t)
  }

  private _build(type: CaptchaType): CaptchaChallenge {
    const base = {
      id:         uid(),
      type,
      expiresAt:  Date.now() + this.ttl,
      attempts:   0,
      maxAttempts: this.maxAttempts,
    }

    if (type === 'math') {
      const fn = pick(MATH_TYPES as readonly (() => MathChallenge)[])!
      const c  = fn()
      const opts = [String(c.answer)]
      while (opts.length < 4) {
        const wrong = c.answer + pick([-3,-2,-1,1,2,3])
        if (!opts.includes(String(wrong))) opts.push(String(wrong))
      }
      return { ...base, question: c.question, answer: String(c.answer), options: shuffle(opts) }
    }

    if (type === 'emoji') {
      const c = makeEmojiChallenge()
      return { ...base, question: c.question, answer: c.answer, options: c.options }
    }

    if (type === 'pattern') {
      const c = makePatternChallenge()
      return { ...base, question: c.question, answer: c.answer, options: c.options }
    }

    // quiz
    const c = makeQuizChallenge()
    return { ...base, question: c.question, answer: c.answer, options: c.options }
  }

  formatMessage(captcha: CaptchaChallenge): string {
    const seconds = Math.floor((captcha.expiresAt - Date.now()) / 1000)
    const type    = { math: '🔢 Matemáticas', emoji: '😀 Emoji', pattern: '📊 Patrón', quiz: '❓ Trivia' }[captcha.type]

    const lines = [
      `*VERIFICACIÓN DE SEGURIDAD* 🛡️`,
      `_Tipo: ${type}_`,
      '',
      captcha.question,
    ]

    if (captcha.options) {
      lines.push('')
      captcha.options.forEach((opt, i) => {
        lines.push(`${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${opt}`)
      })
      lines.push('', `_Responde con el número (1-4) o el texto exacto_`)
    }

    lines.push('', `⏱️ Tiempo: ${seconds}s  |  Intentos: ${captcha.maxAttempts}`)
    return lines.join('\n')
  }
}

export class CaptchaVerification {
  verify(captcha: CaptchaChallenge, answer: string): CaptchaResult {
    captcha.attempts++

    if (Date.now() > captcha.expiresAt) {
      return { success: false, message: '⏱️ Tiempo agotado. Serás expulsado.', attempts: captcha.attempts }
    }

    const normalized = answer.trim().toLowerCase()
    let correct = false

    if (captcha.options) {
      const idx = parseInt(normalized) - 1
      const byIndex = !isNaN(idx) && captcha.options[idx]?.toLowerCase() === captcha.answer.toLowerCase()
      const byText  = normalized === captcha.answer.toLowerCase()
      correct = byIndex || byText
    } else {
      correct = normalized === captcha.answer.toLowerCase()
    }

    if (correct) {
      return { success: true, message: '✅ ¡Verificación correcta! Bienvenido al grupo.', attempts: captcha.attempts }
    }

    const left = captcha.maxAttempts - captcha.attempts
    if (left <= 0) {
      return { success: false, message: '❌ Demasiados intentos fallidos. Serás expulsado.', attempts: captcha.attempts }
    }

    return { success: false, message: `❌ Respuesta incorrecta. Te quedan *${left}* intento(s).`, attempts: captcha.attempts }
  }

  isExpired(captcha: CaptchaChallenge)     { return Date.now() > captcha.expiresAt }
  isMaxAttempts(captcha: CaptchaChallenge) { return captcha.attempts >= captcha.maxAttempts }
  canRetry(captcha: CaptchaChallenge)      { return !this.isExpired(captcha) && !this.isMaxAttempts(captcha) }
}
