import type { Command } from '../../../types/index.js'
import { DrawGuessManager, type DrawCategory } from '@lib/drawguess.js'

const CATEGORIES = new Set<DrawCategory>([
  'animales', 'tecnología', 'comida', 'naturaleza', 'objetos', 'profesiones', 'deportes', 'países',
])

const TURN_TIME = 90_000   // 90s per round
const HINT_TIME = 30_000   // hint every 30s

const command: Command = {
  name:        'adivinar',
  aliases:     ['drawguess', 'dibujar', 'adivina'],
  description: 'Juego de adivinar palabras en grupo',
  category:    'fun',
  groupOnly:   true,
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const sub = (args[0] ?? '').toLowerCase()

    // ── Iniciar ────────────────────────────────────────────────────────────────
    if (!sub || sub === 'start' || sub === 'iniciar' || sub === 'jugar') {
      if (DrawGuessManager.hasGame(jid)) {
        await sock.sendMessage(jid, { text: `_Ya hay un juego activo. !adivinar parar para detenerlo._` }, { quoted: msg })
        return
      }

      const category = args.find(a => CATEGORIES.has(a as DrawCategory)) as DrawCategory | undefined
      const rounds   = Math.min(10, Math.max(1, parseInt(args.find(a => /^\d+$/.test(a)) ?? '3')))

      const game = DrawGuessManager.startGame(jid, sender, pushName, rounds, category)

      // Announce to group
      await sock.sendMessage(jid, {
        text: [
          `*🎨 DRAW & GUESS INICIADO!*`,
          `${rounds} rondas${category ? ` — categoría: ${category}` : ''}`,
          '',
          `✏️ *@${sender.split('@')[0]}* es el dibujante de la ronda 1`,
          `_Te enviaré la palabra en privado..._`,
          '',
          `Categoría de la palabra: *${game.word.category}*`,
          `Letras: ${DrawGuessManager.maskWord(game.word.word, 0)}`,
          '',
          `Los demás: *escriban su respuesta sin prefijo*`,
          `Tienes ${TURN_TIME / 1000}s. ¡Dibuja con emojis en el grupo!`,
        ].join('\n'),
        mentions: [sender],
      }, { quoted: msg })

      // Send word privately
      await sock.sendMessage(sender, {
        text: `🎨 Tu palabra es: *${game.word.word.toUpperCase()}*\n_Dibuja en el grupo usando emojis, sin decir la palabra._`,
      }).catch(() => {
        sock.sendMessage(jid, { text: `⚠️ No pude enviarte la palabra en privado, @${sender.split('@')[0]}. Actívame primero.`, mentions: [sender] })
      })

      // Progressive hints
      let hintCount = 0
      game.hintTimer = setInterval(() => {
        hintCount++
        if (!DrawGuessManager.hasGame(jid)) { clearInterval(game.hintTimer!); return }
        const hint = DrawGuessManager.revealHint(game)
        if (hint) {
          sock.sendMessage(jid, { text: `💡 *Pista ${hintCount}:* ${hint}` }).catch(() => {})
        }
        const masked = DrawGuessManager.maskWord(game.word.word, game.hintLevel)
        sock.sendMessage(jid, { text: `🔤 ${masked}` }).catch(() => {})
      }, HINT_TIME) as unknown as NodeJS.Timeout

      // End timer
      game.endTimer = setTimeout(async () => {
        if (!DrawGuessManager.hasGame(jid)) return
        const g2 = DrawGuessManager.getGame(jid)
        if (!g2) return

        await sock.sendMessage(jid, {
          text: `⏰ *Tiempo agotado!* La palabra era: *${g2.word.word}*\n\n${DrawGuessManager.formatScoreboard(g2)}`,
        }).catch(() => {})

        if (g2.round >= g2.maxRounds) {
          const final = DrawGuessManager.endGame(jid)
          await sendFinalScores(sock, jid, final)
        } else {
          const players = [...g2.players.keys()].filter(p => p !== g2.drawer)
          const nextDrawer = players.length ? players[Math.floor(Math.random() * players.length)]! : g2.drawer
          const nextName   = g2.players.get(nextDrawer)?.name ?? nextDrawer.split('@')[0]!

          clearInterval(g2.hintTimer!)
          clearTimeout(g2.endTimer!)

          const word = DrawGuessManager.nextRound(g2, nextDrawer, nextName)
          if (!word) { DrawGuessManager.endGame(jid); return }

          await sock.sendMessage(jid, {
            text: `*🎨 Ronda ${g2.round}/${g2.maxRounds}*\n✏️ @${nextDrawer.split('@')[0]} dibuja ahora!\nCategoría: ${word.category}\n${DrawGuessManager.maskWord(word.word, 0)}`,
            mentions: [nextDrawer],
          })

          await sock.sendMessage(nextDrawer, {
            text: `🎨 Tu palabra es: *${word.word.toUpperCase()}*`,
          }).catch(() => {})
        }
      }, TURN_TIME) as unknown as NodeJS.Timeout

      return
    }

    // ── Parar ─────────────────────────────────────────────────────────────────
    if (sub === 'parar' || sub === 'stop' || sub === 'terminar') {
      const game = DrawGuessManager.getGame(jid)
      if (!game) {
        await sock.sendMessage(jid, { text: `_No hay juego activo._` }, { quoted: msg })
        return
      }

      await sock.sendMessage(jid, {
        text: `🛑 Juego detenido. La palabra era: *${game.word.word}*\n\n${DrawGuessManager.formatScoreboard(game)}`,
      }, { quoted: msg })

      const final = DrawGuessManager.endGame(jid)
      await sendFinalScores(sock, jid, final)
      return
    }

    // ── Puntaje ───────────────────────────────────────────────────────────────
    if (sub === 'puntaje' || sub === 'score' || sub === 'puntos') {
      const game = DrawGuessManager.getGame(jid)
      if (!game) {
        await sock.sendMessage(jid, { text: `_No hay juego activo._` }, { quoted: msg })
        return
      }
      await sock.sendMessage(jid, { text: DrawGuessManager.formatScoreboard(game) }, { quoted: msg })
      return
    }

    // ── Unirse ────────────────────────────────────────────────────────────────
    if (sub === 'unirse' || sub === 'join') {
      const game = DrawGuessManager.getGame(jid)
      if (!game) {
        await sock.sendMessage(jid, { text: `_No hay juego activo._` }, { quoted: msg })
        return
      }
      DrawGuessManager.joinGame(game, sender, pushName)
      await sock.sendMessage(jid, { text: `✅ @${sender.split('@')[0]} se unió al juego!`, mentions: [sender] }, { quoted: msg })
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*🎨 DRAW & GUESS*

> !adivinar — Iniciar juego (eres el dibujante)
> !adivinar <rondas> — Ej: !adivinar 5
> !adivinar <categoría> — Filtrar palabras
> !adivinar unirse — Unirse al juego activo
> !adivinar puntaje — Ver puntuación actual
> !adivinar parar — Detener el juego

*Categorías:* animales · tecnología · comida · naturaleza · objetos · profesiones · deportes · países

_El dibujante recibe la palabra en privado. Los demás adivinan escribiendo en el grupo (sin prefijo)._`,
    }, { quoted: msg })
  },
}

async function sendFinalScores(sock: any, jid: string, players: ReturnType<typeof DrawGuessManager.endGame>) {
  if (!players.length) return
  const medals = ['🥇', '🥈', '🥉']
  const lines  = ['*🏆 JUEGO TERMINADO — PUNTUACIÓN FINAL*', '']
  players.forEach((p, i) => {
    lines.push(`${medals[i] ?? `${i + 1}.`} *${p.name}* — ${p.score} pts`)
  })
  await sock.sendMessage(jid, { text: lines.join('\n') }).catch(() => {})
}

export default command
