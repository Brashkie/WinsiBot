import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData, userData } from '@core/events.js'
import { Arena, type BattleAction, type PvpProfile } from '@lib/pvp.js'

const ACTIONS = new Set<BattleAction>(['atacar', 'poderoso', 'defender', 'curar', 'ultimate'])

function getProfile(jid: string, name: string): PvpProfile {
  const u = getUserData(jid, name)
  return u.pvp ?? Arena.defaultProfile()
}

const command: Command = {
  name:        'arena',
  aliases:     ['pvp', 'batallar'],
  description: 'Arena PvP con sistema ELO y divisiones',
  category:    'rpg',
  cooldown:    2,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const mentioned = (msg as any).message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined ?? []
    const sub = (args[0] ?? '').toLowerCase()

    // ── Acciones de batalla (si está en batalla) ──────────────────────────────
    if (ACTIONS.has(sub as BattleAction)) {
      const battle = Arena.getBattle(sender)
      if (!battle) {
        await sock.sendMessage(jid, { text: `_No estás en una batalla. Usa !arena retar @usuario_` }, { quoted: msg })
        return
      }
      if (battle.turn !== sender) {
        const other = battle.turn === battle.p1 ? battle.p2 : battle.p1
        await sock.sendMessage(jid, { text: `⏳ No es tu turno. Espera a que @${other.split('@')[0]} actúe.`, mentions: [other] }, { quoted: msg })
        return
      }

      const n1 = getUserData(battle.p1).name || battle.p1.split('@')[0]!
      const n2 = getUserData(battle.p2).name || battle.p2.split('@')[0]!

      const result = Arena.processAction(battle, sender, sub as BattleAction)

      if (result.log.startsWith('❌')) {
        await sock.sendMessage(jid, { text: result.log }, { quoted: msg })
        return
      }

      if (result.over && result.winner) {
        const loser = result.winner === battle.p1 ? battle.p2 : battle.p1

        const winProfile = getProfile(result.winner, '')
        const loseProfile = getProfile(loser, '')
        const [newWinElo, newLoseElo] = Arena.calcElo(winProfile, loseProfile)

        winProfile.elo = newWinElo
        winProfile.wins++
        winProfile.streak++
        loseProfile.elo = newLoseElo
        loseProfile.losses++
        loseProfile.streak = 0

        patchUserData(result.winner, { pvp: winProfile })
        patchUserData(loser, { pvp: loseProfile })

        const winnerName = result.winner === battle.p1 ? n1 : n2
        const loserName  = loser === battle.p1 ? n1 : n2

        let reward = ''
        if (battle.bet > 0) {
          const winnerUser = getUserData(result.winner)
          patchUserData(result.winner, { money: winnerUser.money + battle.bet * 2 })
          const loserUser = getUserData(loser)
          patchUserData(loser, { money: Math.max(0, loserUser.money - battle.bet) })
          reward = `\n💰 @${result.winner.split('@')[0]} gana ${(battle.bet * 2).toLocaleString()} monedas!`
        }

        Arena.endBattle(battle)

        await sock.sendMessage(jid, {
          text: [
            `${result.log}`,
            '',
            `🏆 *¡@${result.winner.split('@')[0]} GANÓ LA BATALLA!*`,
            `📊 ${winnerName}: ELO ${winProfile.elo - (newWinElo - winProfile.elo)} → *${newWinElo}* (+${newWinElo - winProfile.elo + (newWinElo - winProfile.elo)})`,
            `📉 ${loserName}: ELO ${loseProfile.elo + (loseProfile.elo - newLoseElo)} → *${newLoseElo}*`,
            reward,
          ].filter(Boolean).join('\n'),
          mentions: [result.winner, loser],
        }, { quoted: msg })
        return
      }

      const n1new = getUserData(battle.p1).name || battle.p1.split('@')[0]!
      const n2new = getUserData(battle.p2).name || battle.p2.split('@')[0]!

      await sock.sendMessage(jid, {
        text: `${result.log}\n\n${Arena.formatStatus(battle, n1new, n2new)}`,
      }, { quoted: msg })
      return
    }

    // ── Retar ─────────────────────────────────────────────────────────────────
    if (sub === 'retar' || sub === 'challenge' || sub === 'duelo') {
      const target = mentioned[0]
      if (!target) {
        await sock.sendMessage(jid, { text: `_Uso: !arena retar @usuario [apuesta]\nEjemplo: !arena retar @rival 500_` }, { quoted: msg })
        return
      }
      if (target === sender) {
        await sock.sendMessage(jid, { text: `_No puedes retarte a ti mismo._` }, { quoted: msg })
        return
      }

      const bet = parseInt(args.find(a => /^\d+$/.test(a)) ?? '0')
      if (bet > 0) {
        const user = getUserData(sender)
        if (user.money < bet) {
          await sock.sendMessage(jid, { text: `❌ No tienes suficientes monedas para apostar ${bet.toLocaleString()}.` }, { quoted: msg })
          return
        }
      }

      if (!Arena.challenge(sender, target, bet)) {
        await sock.sendMessage(jid, { text: `❌ No se pudo crear el reto. Uno de los dos ya está en una batalla o tiene un reto pendiente.` }, { quoted: msg })
        return
      }

      const profile = getProfile(sender, pushName)
      const div     = Arena.getDivision(profile.elo)

      await sock.sendMessage(jid, {
        text: [
          `⚔️ *@${sender.split('@')[0]}* reta a *@${target.split('@')[0]}* a un duelo!`,
          `${Arena.divEmoji(profile.elo)} ELO: ${profile.elo} (${div})`,
          bet > 0 ? `💰 Apuesta: ${bet.toLocaleString()} monedas` : '',
          ``,
          `@${target.split('@')[0]}, tienes 60s para responder:`,
          `▶️ !arena aceptar — para aceptar`,
          `❌ !arena rechazar — para declinar`,
        ].filter(Boolean).join('\n'),
        mentions: [sender, target],
      }, { quoted: msg })
      return
    }

    // ── Aceptar ───────────────────────────────────────────────────────────────
    if (sub === 'aceptar' || sub === 'accept') {
      const battle = Arena.acceptChallenge(sender)
      if (!battle) {
        await sock.sendMessage(jid, { text: `_No tienes reto pendiente o ya expiró._` }, { quoted: msg })
        return
      }

      const n1 = getUserData(battle.p1).name || battle.p1.split('@')[0]!
      const n2 = getUserData(battle.p2).name || battle.p2.split('@')[0]!

      await sock.sendMessage(jid, {
        text: [
          `⚔️ *¡BATALLA INICIADA!*`,
          `@${battle.p1.split('@')[0]} vs @${battle.p2.split('@')[0]}`,
          battle.bet > 0 ? `💰 Apuesta: ${battle.bet.toLocaleString()} monedas` : '',
          '',
          Arena.formatStatus(battle, n1, n2),
          '',
          `_Comienza @${battle.p1.split('@')[0]} — usa: atacar · poderoso · defender · curar · ultimate_`,
        ].filter(Boolean).join('\n'),
        mentions: [battle.p1, battle.p2],
      }, { quoted: msg })
      return
    }

    // ── Rechazar ──────────────────────────────────────────────────────────────
    if (sub === 'rechazar' || sub === 'decline' || sub === 'no') {
      const declined = Arena.declineChallenge(sender)
      if (!declined) {
        await sock.sendMessage(jid, { text: `_No tienes reto pendiente._` }, { quoted: msg })
        return
      }
      await sock.sendMessage(jid, { text: `❌ Reto rechazado.` }, { quoted: msg })
      return
    }

    // ── Estado de batalla ─────────────────────────────────────────────────────
    if (sub === 'estado' || sub === 'status' || sub === 'batalla') {
      const battle = Arena.getBattle(sender)
      if (!battle) {
        await sock.sendMessage(jid, { text: `_No estás en ninguna batalla activa._` }, { quoted: msg })
        return
      }
      const n1 = getUserData(battle.p1).name || battle.p1.split('@')[0]!
      const n2 = getUserData(battle.p2).name || battle.p2.split('@')[0]!
      await sock.sendMessage(jid, { text: Arena.formatStatus(battle, n1, n2) }, { quoted: msg })
      return
    }

    // ── Rendirse ──────────────────────────────────────────────────────────────
    if (sub === 'rendirse' || sub === 'surrender' || sub === 'huir') {
      const battle = Arena.getBattle(sender)
      if (!battle) {
        await sock.sendMessage(jid, { text: `_No estás en una batalla._` }, { quoted: msg })
        return
      }
      const winner = battle.p1 === sender ? battle.p2 : battle.p1
      const wp = getProfile(winner, '')
      const lp = getProfile(sender, '')
      const [we, le] = Arena.calcElo(wp, lp)
      wp.elo = we; wp.wins++
      lp.elo = le; lp.losses++
      patchUserData(winner, { pvp: wp })
      patchUserData(sender,  { pvp: lp })
      Arena.endBattle(battle)

      await sock.sendMessage(jid, {
        text: `🏳️ @${sender.split('@')[0]} se rindió. @${winner.split('@')[0]} gana la batalla!`,
        mentions: [sender, winner],
      }, { quoted: msg })
      return
    }

    // ── Perfil / Ranking ──────────────────────────────────────────────────────
    if (!sub || sub === 'perfil' || sub === 'stats' || sub === 'elo') {
      const target = mentioned[0] ?? sender
      const targetName = getUserData(target).name || target.split('@')[0]!
      const profile = getProfile(target, targetName)
      await sock.sendMessage(jid, { text: Arena.formatProfile(profile, targetName) }, { quoted: msg })
      return
    }

    if (sub === 'ranking' || sub === 'top' || sub === 'leaderboard') {
      const ranked = [...userData.entries()]
        .filter(([, u]) => u.pvp && u.pvp.wins + u.pvp.losses > 0)
        .sort(([, a], [, b]) => (b.pvp?.elo ?? 1000) - (a.pvp?.elo ?? 1000))
        .slice(0, 10)

      if (!ranked.length) {
        await sock.sendMessage(jid, { text: `_Nadie ha batallado todavía._` }, { quoted: msg })
        return
      }

      const medals = ['🥇', '🥈', '🥉']
      const lines  = ['*⚔️ RANKING ARENA*', '']
      ranked.forEach(([jidR, u], i) => {
        const p    = u.pvp!
        const div  = Arena.getDivision(p.elo)
        const m    = medals[i] ?? `${i + 1}.`
        lines.push(`${m} ${Arena.divEmoji(p.elo)} *${u.name || jidR.split('@')[0]}* — ELO ${p.elo} (${div}) — ${p.wins}V/${p.losses}D`)
      })
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*⚔️ SISTEMA ARENA*

> !arena retar @user [apuesta] — Retar a duelo
> !arena aceptar — Aceptar reto
> !arena rechazar — Declinar reto
> !arena estado — Ver estado de batalla
> !arena rendirse — Rendirse
> !arena ranking — Top 10 ELO

*Acciones en batalla:*
> !arena atacar — Ataque normal (8-18 daño)
> !arena poderoso — Ataque fuerte (70% éxito, 18-32 daño)
> !arena defender — Escudo temporal (8-16)
> !arena curar — Recuperar 10-20 HP
> !arena ultimate — ¡Solo 1 vez! (30-50 daño + 15 HP)`,
    }, { quoted: msg })
  },
}

export default command
