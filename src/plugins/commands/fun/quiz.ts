import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import {
  QuizManager,
  type QuizCategory,
  type QuizDifficulty,
  type QuizProfile,
  type QuizSession,
} from '@lib/quiz.js'

const CATEGORIES  = new Set<QuizCategory>(['javascript', 'python', 'algoritmos', 'web', 'general'])
const DIFFICULTIES = new Set<QuizDifficulty>(['fácil', 'medio', 'difícil', 'experto', 'extremo'])

function getProfile(jid: string, name: string): QuizProfile {
  return getUserData(jid, name).quizProfile ?? QuizManager.defaultProfile()
}

export const activeQuizSessions = QuizManager['activeSessions' as never] as unknown as Map<string, QuizSession>

export function handleQuizAnswer(jid: string, text: string): QuizSession | undefined {
  return QuizManager.getSession(jid)
}

const command: Command = {
  name:        'quiz',
  aliases:     ['trivia', 'codequiz'],
  description: 'Quiz de programación con sistema ELO',
  category:    'fun',
  cooldown:    2,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const sub = (args[0] ?? '').toLowerCase()
    const user = getUserData(sender, pushName)

    // ── Responder número directamente cuando hay sesión activa ────────────────
    if (/^[1-4]$/.test(sub)) {
      const session = QuizManager.getSession(sender)
      if (!session) {
        await sock.sendMessage(jid, { text: `_No tienes una sesión activa. Usa !quiz para empezar._` }, { quoted: msg })
        return
      }

      const q      = session.questions[session.current]!
      const result = QuizManager.answer(session, sub)
      const profile = getProfile(sender, pushName)
      const delta   = QuizManager.updateElo(profile, result.correct, q.difficulty)

      let response = result.correct
        ? `✅ *¡Correcto!* +${result.pointsGained} pts  (ELO ${delta >= 0 ? '+' : ''}${delta})`
        : `❌ *Incorrecto.* La respuesta era: *${q.options[q.answer]}*${result.explanation ? `\n_${result.explanation}_` : ''}`

      patchUserData(sender, { quizProfile: profile })

      if (result.over) {
        QuizManager.endSession(sender)
        await sock.sendMessage(jid, {
          text: `${response}\n\n${QuizManager.formatResult(session)}`,
        }, { quoted: msg })
        return
      }

      const next = session.questions[session.current]!
      await sock.sendMessage(jid, {
        text: `${response}\n\n${QuizManager.formatQuestion(next, session.current + 1, session.questions.length)}`,
      }, { quoted: msg })
      patchUserData(sender, { quizProfile: profile })
      return
    }

    // ── Pista ─────────────────────────────────────────────────────────────────
    if (sub === 'pista' || sub === 'hint') {
      const session = QuizManager.getSession(sender)
      if (!session) {
        await sock.sendMessage(jid, { text: `_No tienes sesión activa._` }, { quoted: msg })
        return
      }
      const hint = QuizManager.giveHint(session)
      await sock.sendMessage(jid, {
        text: hint ? `💡 *Pista:* ${hint}\n_(-3 puntos por pista)_` : `_Sin pistas para esta pregunta._`,
      }, { quoted: msg })
      return
    }

    // ── Parar ─────────────────────────────────────────────────────────────────
    if (sub === 'parar' || sub === 'stop' || sub === 'salir') {
      const session = QuizManager.getSession(sender)
      if (!session) {
        await sock.sendMessage(jid, { text: `_No tienes sesión activa._` }, { quoted: msg })
        return
      }
      QuizManager.endSession(sender)
      await sock.sendMessage(jid, {
        text: `${QuizManager.formatResult(session)}\n\n_Sesión terminada._`,
      }, { quoted: msg })
      return
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    if (sub === 'stats' || sub === 'perfil' || sub === 'elo') {
      const profile = getProfile(sender, pushName)
      const total   = profile.correct + profile.incorrect
      const wr      = total > 0 ? ((profile.correct / total) * 100).toFixed(1) : '0.0'
      await sock.sendMessage(jid, {
        text: [
          `*📊 STATS QUIZ — ${pushName}*`,
          '',
          `📈 ELO: *${profile.elo}*`,
          `✅ Correctas: ${profile.correct}  ❌ Incorrectas: ${profile.incorrect}`,
          `🎮 Partidas: ${profile.gamesPlayed}  |  Win rate: ${wr}%`,
          `🔥 Racha: ${profile.streak}  |  Mejor racha: ${profile.bestStreak}`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // ── Iniciar quiz ──────────────────────────────────────────────────────────
    if (!sub || sub === 'start' || sub === 'iniciar' || CATEGORIES.has(sub as QuizCategory) || DIFFICULTIES.has(sub as QuizDifficulty)) {
      if (QuizManager.getSession(sender)) {
        await sock.sendMessage(jid, { text: `_Ya tienes una sesión activa. Usa !quiz parar para terminarla._` }, { quoted: msg })
        return
      }

      const category  = args.find(a => CATEGORIES.has(a as QuizCategory))  as QuizCategory | undefined
      const difficulty= args.find(a => DIFFICULTIES.has(a as QuizDifficulty)) as QuizDifficulty | undefined
      const sizeArg   = args.find(a => /^\d+$/.test(a))
      const size      = sizeArg ? Math.min(20, Math.max(3, parseInt(sizeArg))) : 10

      const session = QuizManager.startSession(sender, size, category, difficulty)
      const q       = session.questions[0]!

      await sock.sendMessage(jid, {
        text: [
          `*🎮 QUIZ INICIADO!* ${size} preguntas`,
          category   ? `Categoría: ${category}` : '',
          difficulty ? `Dificultad: ${difficulty}` : '',
          '',
          QuizManager.formatQuestion(q, 1, session.questions.length),
        ].filter(Boolean).join('\n'),
      }, { quoted: msg })
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*📝 CODING QUIZ*

> !quiz — Iniciar con preguntas aleatorias
> !quiz <categoría> — Filtrar por categoría
> !quiz <dificultad> — Filtrar por dificultad
> !quiz pista — Pedir pista (-3 pts)
> !quiz parar — Terminar sesión
> !quiz stats — Ver tus estadísticas

*Categorías:* javascript · python · algoritmos · web · general
*Dificultades:* fácil · medio · difícil · experto · extremo

_Responde con 1, 2, 3 o 4_`,
    }, { quoted: msg })
  },
}

export default command
