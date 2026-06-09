// ─── Game message interceptors for handler.ts ─────────────────────────────────
// Returns true if the message was consumed (no further processing needed)

import type { WASocket } from '@whiskeysockets/baileys'
import { DrawGuessManager } from '@lib/drawguess.js'
import { QuizManager } from '@lib/quiz.js'
import { getUserData, patchUserData } from './index.js'
import { safeSend } from '@lib/media_sender.js'

// ─── Draw & Guess ─────────────────────────────────────────────────────────────

export async function handleDrawGuessMessage(
  sock:      WASocket,
  groupJid:  string,
  senderJid: string,
  text:      string,
): Promise<boolean> {
  const game = DrawGuessManager.getGame(groupJid)
  if (!game || !game.active) return false
  if (game.drawer === senderJid) return false

  DrawGuessManager.joinGame(game, senderJid, getUserData(senderJid).name || senderJid.split('@')[0]!)

  const result = DrawGuessManager.tryGuess(game, text, senderJid)
  if (!result.correct) return false

  await safeSend(() => sock.sendMessage(groupJid, {
    text: `🎉 *¡@${senderJid.split('@')[0]} adivinó la palabra!* +${result.points} pts`,
    mentions: [senderJid],
  }))

  // Check if all active non-drawers have guessed → end round early
  const nonDrawers = [...game.players.keys()].filter(p => p !== game.drawer)
  const allGuessed = nonDrawers.length > 0 && nonDrawers.every(p => game.guessed.has(p))

  if (allGuessed) {
    if (game.hintTimer) clearInterval(game.hintTimer)
    if (game.endTimer)  clearTimeout(game.endTimer)

    await safeSend(() => sock.sendMessage(groupJid, {
      text: `✅ *¡Todos adivinaron!* La palabra era: *${game.word.word}*\n\n${DrawGuessManager.formatScoreboard(game)}`,
    }))

    if (game.round >= game.maxRounds) {
      const final = DrawGuessManager.endGame(groupJid)
      const medals = ['🥇', '🥈', '🥉']
      const lines  = ['*🏆 JUEGO TERMINADO — PUNTAJE FINAL*', '']
      final.forEach((p, i) => lines.push(`${medals[i] ?? `${i + 1}.`} *${p.name}* — ${p.score} pts`))
      await safeSend(() => sock.sendMessage(groupJid, { text: lines.join('\n') }))
    } else {
      const players   = [...game.players.keys()].filter(p => p !== game.drawer)
      const nextDrawer= players.length ? players[Math.floor(Math.random() * players.length)]! : game.drawer
      const nextName  = game.players.get(nextDrawer)?.name ?? nextDrawer.split('@')[0]!
      const nextWord  = DrawGuessManager.nextRound(game, nextDrawer, nextName)

      if (nextWord) {
        await safeSend(() => sock.sendMessage(groupJid, {
          text: `🎨 *Ronda ${game.round}/${game.maxRounds}*\n✏️ @${nextDrawer.split('@')[0]} dibuja!\nCategoría: ${nextWord.category}\n${DrawGuessManager.maskWord(nextWord.word, 0)}`,
          mentions: [nextDrawer],
        }))
        await sock.sendMessage(nextDrawer, {
          text: `🎨 Tu palabra es: *${nextWord.word.toUpperCase()}*`,
        }).catch(() => {})
      } else {
        DrawGuessManager.endGame(groupJid)
      }
    }
  }

  return true  // message consumed
}

// ─── Quiz answer ──────────────────────────────────────────────────────────────

export async function handleQuizMessage(
  sock:      WASocket,
  jid:       string,
  senderJid: string,
  text:      string,
  name:      string,
): Promise<boolean> {
  if (!/^[1-4]$/.test(text.trim())) return false
  const session = QuizManager.getSession(senderJid)
  if (!session) return false

  const q      = session.questions[session.current]!
  const result = QuizManager.answer(session, text.trim())
  const profile= getUserData(senderJid, name).quizProfile ?? QuizManager.defaultProfile()
  const delta  = QuizManager.updateElo(profile, result.correct, q.difficulty)
  patchUserData(senderJid, { quizProfile: profile })

  const eloStr = `(ELO ${delta >= 0 ? '+' : ''}${delta})`

  let response = result.correct
    ? `✅ *¡Correcto!* +${result.pointsGained} pts ${eloStr}`
    : `❌ *Incorrecto.* La respuesta era: *${q.options[q.answer]}*${result.explanation ? `\n_${result.explanation}_` : ''} ${eloStr}`

  if (result.over) {
    QuizManager.endSession(senderJid)
    await safeSend(() => sock.sendMessage(jid, {
      text: `${response}\n\n${QuizManager.formatResult(session)}`,
    }))
    return true
  }

  const next = session.questions[session.current]!
  await safeSend(() => sock.sendMessage(jid, {
    text: `${response}\n\n${QuizManager.formatQuestion(next, session.current + 1, session.questions.length)}`,
  }))
  return true
}
