import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData, userData } from '@core/events.js'
import { Arena, CPU, type BattleAction, type BattleState, type NivelCpu, type PvpProfile } from '@lib/pvp.js'
import { elegirAccion } from '@lib/arenaAI.js'
import { ApuestasAbiertas } from '@lib/openBets.js'

const ACTIONS = new Set<BattleAction>(['atacar', 'poderoso', 'defender', 'curar', 'ultimate'])

const NIVELES: Record<string, NivelCpu> = {
  facil: 'facil', 'fácil': 'facil', easy: 'facil',
  normal: 'normal', medio: 'normal',
  dificil: 'dificil', 'difícil': 'dificil', hard: 'dificil',
}
const NOMBRE_NIVEL: Record<NivelCpu, string> = { facil: 'fácil', normal: 'normal', dificil: 'difícil' }

/** El nombre de un peleador. La CPU no es un usuario: getUserData le crearía
 *  un registro, y aparecería en los rankings. */
function nombre(jid: string, battle: BattleState): string {
  if (jid === CPU) return `🤖 CPU (${NOMBRE_NIVEL[battle.cpu ?? 'normal']})`
  return getUserData(jid).name || jid.split('@')[0]!
}

function getProfile(jid: string, name: string): PvpProfile {
  const u = getUserData(jid, name)
  return u.pvp ?? Arena.defaultProfile()
}

// ─── Apuestas ─────────────────────────────────────────────────────────────────
// Se RETIENEN al aceptar, a los dos, y el ganador se lleva el pozo. Antes se
// cobraban al terminar, y eso tenía tres agujeros: se podía apostar, pasarle
// el saldo a otro y perder sin pagar; al rival no se le miraba el saldo al
// aceptar; y el ganador recibía el doble de la apuesta mientras al perdedor se
// le quitaba una, así que cada duelo con apuesta creaba dinero de la nada.
//
// Lo retenido se anota en data/arena.json y se devuelve si un reinicio corta
// la pelea (ver openBets.ts), o si se abandona y expira.

const abiertas = new ApuestasAbiertas('arena')

function anotar(): void {
  const filas: Array<[string, number]> = []
  for (const b of Arena.batallas()) {
    if (b.bet > 0) filas.push([b.p1, b.bet], [b.p2, b.bet])
  }
  abiertas.anotar(filas)
}

/** Ver openBets.ts. La llama el 'ready' de index.ts. */
export const devolverManosInterrumpidas = () => abiertas.devolver()

function pagarPozo(winner: string, battle: BattleState): void {
  if (battle.bet > 0) patchUserData(winner, { money: getUserData(winner).money + battle.bet * 2 })
  anotar()
}

// Una pelea abandonada: se devuelve lo retenido a cada uno.
Arena.alExpirar = (battle) => {
  if (battle.bet <= 0) return
  for (const j of [battle.p1, battle.p2]) {
    patchUserData(j, { money: getUserData(j).money + battle.bet })
  }
  anotar()
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

      const n1 = nombre(battle.p1, battle)
      const n2 = nombre(battle.p2, battle)

      let result = Arena.processAction(battle, sender, sub as BattleAction)

      if (result.log.startsWith('❌')) {
        await sock.sendMessage(jid, { text: result.log }, { quoted: msg })
        return
      }

      // ── Contra la CPU: juega en el mismo mensaje ────────────────────────────
      if (battle.cpu) {
        let log = `👤 ${result.log}`
        if (!result.over) {
          const accion = elegirAccion(battle, battle.cpu)
          result = Arena.processAction(battle, CPU, accion)
          log += `
🤖 ${result.log}`
        }
        if (result.over) {
          Arena.endBattle(battle)
          const gano = result.winner === sender
          await sock.sendMessage(jid, {
            text: [
              log,
              '',
              gano
                ? `🏆 *¡Le ganaste a la CPU en ${NOMBRE_NIVEL[battle.cpu]}!*${battle.cpu !== 'dificil' ? `  Prueba con \`!arena cpu ${battle.cpu === 'facil' ? 'normal' : 'dificil'}\`` : ''}`
                : `💀 *La CPU (${NOMBRE_NIVEL[battle.cpu]}) te ganó.* Prueba otra vez con \`!arena cpu ${battle.cpu}\``,
              `_Práctica: sin ELO ni apuesta._`,
            ].join('\n'),
          }, { quoted: msg })
          return
        }
        await sock.sendMessage(jid, { text: `${log}\n\n${Arena.formatStatus(battle, n1, n2)}` }, { quoted: msg })
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

        Arena.endBattle(battle)
        pagarPozo(result.winner, battle)
        const reward = battle.bet > 0
          ? `\n💰 @${result.winner.split('@')[0]} se lleva el pozo: ${(battle.bet * 2).toLocaleString()} monedas!`
          : ''

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

    // ── Contra la CPU ─────────────────────────────────────────────────────────
    if (sub === 'cpu' || sub === 'bot' || sub === 'practica' || sub === 'práctica') {
      const nivel = NIVELES[(args[1] ?? 'normal').toLowerCase()]
      if (!nivel) {
        await sock.sendMessage(jid, { text: `_Uso: !arena cpu [facil|normal|dificil]_` }, { quoted: msg })
        return
      }
      const battle = Arena.startVsCpu(sender, nivel)
      if (!battle) {
        await sock.sendMessage(jid, { text: `❌ Ya estás en una batalla o tienes un reto pendiente.` }, { quoted: msg })
        return
      }
      await sock.sendMessage(jid, {
        text: [
          `🤖 *¡BATALLA CONTRA LA CPU!* — nivel ${NOMBRE_NIVEL[nivel]}`,
          `_Práctica: sin ELO ni apuesta. La CPU calcula sus jugadas por adelantado (expectiminimax)._`,
          '',
          Arena.formatStatus(battle, nombre(battle.p1, battle), nombre(battle.p2, battle)),
          '',
          `_Empiezas tú — usa: !arena atacar · poderoso · defender · curar · ultimate_`,
        ].join('\n'),
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
      if (target === CPU) {
        await sock.sendMessage(jid, { text: `_Para pelear contra la CPU usa !arena cpu [facil|normal|dificil]_` }, { quoted: msg })
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
      // El saldo de los dos se mira ACÁ, no al retar: en el minuto que dura el
      // reto, cualquiera pudo gastarlo.
      const reto = Arena.getPendingChallenge(sender)
      if (reto && reto.bet > 0) {
        const corto = [reto.challenger, reto.opponent].filter(j => getUserData(j).money < reto.bet)
        if (corto.length) {
          Arena.declineChallenge(sender)
          await sock.sendMessage(jid, {
            text: `❌ El reto se cancela: ${corto.map(j => `@${j.split('@')[0]}`).join(' y ')} no tiene ${reto.bet.toLocaleString()} monedas para la apuesta.`,
            mentions: corto,
          }, { quoted: msg })
          return
        }
      }

      const battle = Arena.acceptChallenge(sender)
      if (!battle) {
        await sock.sendMessage(jid, { text: `_No tienes reto pendiente o ya expiró._` }, { quoted: msg })
        return
      }
      if (battle.bet > 0) {
        for (const j of [battle.p1, battle.p2]) {
          patchUserData(j, { money: getUserData(j).money - battle.bet })
        }
        anotar()
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
      await sock.sendMessage(jid, { text: Arena.formatStatus(battle, nombre(battle.p1, battle), nombre(battle.p2, battle)) }, { quoted: msg })
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
      if (battle.cpu) {
        Arena.endBattle(battle)
        await sock.sendMessage(jid, { text: `🏳️ Te rendiste ante la CPU. _Práctica: sin ELO._` }, { quoted: msg })
        return
      }
      const wp = getProfile(winner, '')
      const lp = getProfile(sender, '')
      const [we, le] = Arena.calcElo(wp, lp)
      wp.elo = we; wp.wins++
      lp.elo = le; lp.losses++
      patchUserData(winner, { pvp: wp })
      patchUserData(sender,  { pvp: lp })
      Arena.endBattle(battle)
      // Rendirse no devuelve la apuesta: si no, rendirse al ir perdiendo
      // saldría gratis.
      pagarPozo(winner, battle)

      await sock.sendMessage(jid, {
        text: `🏳️ @${sender.split('@')[0]} se rindió. @${winner.split('@')[0]} gana la batalla!${battle.bet > 0 ? ` 💰 Se lleva el pozo: ${(battle.bet * 2).toLocaleString()} monedas.` : ''}`,
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
> !arena cpu [facil|normal|dificil] — Practicar contra la CPU
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
