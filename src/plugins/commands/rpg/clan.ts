import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  getUserClan, createClan, joinClan, leaveClan, getClan, userClan, clanData,
} from '@core/events.js'
import {
  ClanManager,
  type ClanRank,
  TERRITORIES,
} from '@lib/clan.js'

const RANKS: ClanRank[] = ['miembro', 'élite', 'coleader']

const command: Command = {
  name:        'clan',
  aliases:     ['guild', 'gremio'],
  description: 'Sistema completo de clanes con guerras, territorios y alianzas',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const mentioned = (msg as any).message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined ?? []
    const sub  = (args[0] ?? '').toLowerCase()

    const myClan = getUserClan(sender)
    const ext    = myClan ? ClanManager.getExtended(myClan.tag) : null
    const myRank = myClan && ext ? ClanManager.getRank(ext, sender, myClan.leader) : null

    // ── Crear ──────────────────────────────────────────────────────────────────
    if (sub === 'crear' || sub === 'create') {
      if (myClan) {
        await sock.sendMessage(jid, { text: `_Ya perteneces al clan [${myClan.tag}]. Sal primero con !clan salir._` }, { quoted: msg })
        return
      }

      const tag  = (args[1] ?? '').toUpperCase().slice(0, 5)
      const name = args.slice(2).join(' ').trim()
      const icon = (name.match(/\p{Emoji}/u) ?? [])[0] ?? '⚔️'
      const cleanName = name.replace(/\p{Emoji}/gu, '').trim() || name

      if (!tag || tag.length < 2 || !cleanName) {
        await sock.sendMessage(jid, { text: `_Uso: !clan crear <TAG> <Nombre del Clan> [emoji]\nEjemplo: !clan crear WB WinsiBot ⚔️_` }, { quoted: msg })
        return
      }

      if (!/^[A-Z0-9]+$/.test(tag)) {
        await sock.sendMessage(jid, { text: `❌ El tag solo puede tener letras y números (ej: WB, CLAN, X99)` }, { quoted: msg })
        return
      }

      const newClan = createClan(sender, cleanName, tag, icon)
      if (!newClan) {
        await sock.sendMessage(jid, { text: `❌ El tag [${tag}] ya está en uso.` }, { quoted: msg })
        return
      }

      const newExt = ClanManager.getExtended(tag)
      ClanManager.log(newExt, `${pushName} fundó el clan`)

      await sock.sendMessage(jid, {
        text: [
          `${icon} *¡Clan [${tag}] creado!*`,
          `Nombre: ${cleanName}`,
          `Líder: @${sender.split('@')[0]}`,
          '',
          `_Usa !clan invitar @usuario para añadir miembros_`,
          `_!clan info para ver los detalles_`,
        ].join('\n'),
        mentions: [sender],
      }, { quoted: msg })
      return
    }

    // ── Info ──────────────────────────────────────────────────────────────────
    if (!sub || sub === 'info' || sub === 'ver') {
      const tagArg = args[1]?.toUpperCase()
      const targetClan = tagArg ? getClan(tagArg) : myClan
      if (!targetClan) {
        await sock.sendMessage(jid, {
          text: myClan ? `❌ Clan [${tagArg}] no encontrado.` : `_No perteneces a ningún clan.\n!clan crear <TAG> <nombre>_`,
        }, { quoted: msg })
        return
      }
      const targetExt = ClanManager.getExtended(targetClan.tag)
      await sock.sendMessage(jid, {
        text: ClanManager.formatInfo(
          targetClan.tag,
          targetClan.name,
          targetClan.icon,
          targetClan.level,
          targetExt,
          targetClan.members.length,
        ),
      }, { quoted: msg })
      return
    }

    // ── Miembros ──────────────────────────────────────────────────────────────
    if (sub === 'miembros' || sub === 'members' || sub === 'lista') {
      if (!myClan) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      const lines = [`*${myClan.icon} MIEMBROS DE [${myClan.tag}]*`, '']
      for (const m of myClan.members) {
        const rank    = ext ? ClanManager.getRank(ext, m, myClan.leader) : 'miembro'
        const uname   = getUserData(m).name || m.split('@')[0]
        lines.push(`${ClanManager.rankEmoji(rank)} ${uname} — ${rank}`)
      }
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
      return
    }

    // ── Invitar / Aceptar solicitud ────────────────────────────────────────────
    if (sub === 'invitar' || sub === 'invite') {
      if (!myClan) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      if (myRank !== 'líder' && myRank !== 'coleader') {
        await sock.sendMessage(jid, { text: `❌ Solo el líder o coleader puede invitar.` }, { quoted: msg }); return
      }
      const target = mentioned[0]
      if (!target) { await sock.sendMessage(jid, { text: `_Usa: !clan invitar @usuario_` }, { quoted: msg }); return }

      if (getUserClan(target)) {
        await sock.sendMessage(jid, { text: `❌ @${target.split('@')[0]} ya está en un clan.`, mentions: [target] }, { quoted: msg }); return
      }

      const joined = joinClan(target, myClan.tag)
      if (!joined) { await sock.sendMessage(jid, { text: `❌ No se pudo añadir.` }, { quoted: msg }); return }

      if (ext) ClanManager.log(ext, `${getUserData(target).name || target.split('@')[0]} se unió al clan`)

      await sock.sendMessage(jid, {
        text: `✅ @${target.split('@')[0]} se unió a [${myClan.tag}]!`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    // ── Solicitar unirse ──────────────────────────────────────────────────────
    if (sub === 'solicitar' || sub === 'join' || sub === 'unirse') {
      if (myClan) { await sock.sendMessage(jid, { text: `_Ya perteneces a [${myClan.tag}]._` }, { quoted: msg }); return }
      const tag = (args[1] ?? '').toUpperCase()
      const clan = getClan(tag)
      if (!clan) { await sock.sendMessage(jid, { text: `❌ Clan [${tag}] no encontrado.` }, { quoted: msg }); return }
      const targetExt = ClanManager.getExtended(tag)

      if (clan.isOpen) {
        joinClan(sender, tag)
        ClanManager.log(targetExt, `${pushName} se unió (clan abierto)`)
        await sock.sendMessage(jid, { text: `✅ Te uniste a *${clan.name}* [${tag}]!` }, { quoted: msg })
        return
      }

      ClanManager.addRequest(targetExt, sender)
      await sock.sendMessage(jid, {
        text: `📩 Solicitud enviada a *${clan.name}* [${tag}]. El líder debe aceptarla.`,
      }, { quoted: msg })
      return
    }

    // ── Solicitudes pendientes ─────────────────────────────────────────────────
    if (sub === 'solicitudes' || sub === 'requests') {
      if (!myClan) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      if (myRank !== 'líder' && myRank !== 'coleader') { await sock.sendMessage(jid, { text: `❌ Solo líder/coleader puede ver solicitudes.` }, { quoted: msg }); return }
      if (!ext?.requests.length) { await sock.sendMessage(jid, { text: `_Sin solicitudes pendientes._` }, { quoted: msg }); return }

      const lines = [`*📩 SOLICITUDES [${myClan.tag}]*`, '']
      ext.requests.forEach((r, i) => {
        lines.push(`${i + 1}. @${r.split('@')[0]} (${getUserData(r).name})`)
      })
      lines.push('', `_!clan aceptar @usuario_`)
      await sock.sendMessage(jid, { text: lines.join('\n'), mentions: ext.requests }, { quoted: msg })
      return
    }

    if (sub === 'aceptar' || sub === 'accept') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      if (myRank !== 'líder' && myRank !== 'coleader') { await sock.sendMessage(jid, { text: `❌ Solo líder/coleader.` }, { quoted: msg }); return }
      const target = mentioned[0] ?? ext.requests.find(r => args[1] && r.includes(args[1]))
      if (!target || !ClanManager.approveRequest(ext, target)) {
        await sock.sendMessage(jid, { text: `❌ Solicitud no encontrada.` }, { quoted: msg }); return
      }
      joinClan(target, myClan.tag)
      ClanManager.log(ext, `${getUserData(target).name || target.split('@')[0]} fue aceptado`)
      await sock.sendMessage(jid, { text: `✅ @${target.split('@')[0]} aceptado en [${myClan.tag}]!`, mentions: [target] }, { quoted: msg })
      return
    }

    // ── Salir ─────────────────────────────────────────────────────────────────
    if (sub === 'salir' || sub === 'leave' || sub === 'exit') {
      if (!myClan) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      const tag  = myClan.tag
      const name = myClan.name
      if (ext) ClanManager.log(ext, `${pushName} abandonó el clan`)
      leaveClan(sender)
      await sock.sendMessage(jid, { text: `_Saliste de *${name}* [${tag}]._` }, { quoted: msg })
      return
    }

    // ── Rango ─────────────────────────────────────────────────────────────────
    if (sub === 'rango' || sub === 'rank' || sub === 'ascender') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      if (myRank !== 'líder') { await sock.sendMessage(jid, { text: `❌ Solo el líder puede cambiar rangos.` }, { quoted: msg }); return }
      const target    = mentioned[0]
      const newRank   = (args[2] ?? args[1] ?? '').toLowerCase() as ClanRank
      if (!target || !RANKS.includes(newRank)) {
        await sock.sendMessage(jid, { text: `_Uso: !clan rango @usuario <miembro|élite|coleader>_` }, { quoted: msg }); return
      }
      if (!myClan.members.includes(target)) {
        await sock.sendMessage(jid, { text: `❌ No es miembro de tu clan.` }, { quoted: msg }); return
      }
      ClanManager.setRank(ext, target, newRank)
      ClanManager.log(ext, `${pushName} cambió rango de ${getUserData(target).name || target.split('@')[0]} a ${newRank}`)
      await sock.sendMessage(jid, {
        text: `✅ @${target.split('@')[0]} ahora es *${newRank}* ${ClanManager.rankEmoji(newRank)}`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    // ── Tesoro ────────────────────────────────────────────────────────────────
    if (sub === 'tesoro' || sub === 'treasury') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }

      const action = (args[1] ?? '').toLowerCase()
      if (action === 'donar') {
        const amount = parseInt(args[2] ?? '0')
        const user   = getUserData(sender)
        if (isNaN(amount) || amount <= 0 || user.money < amount) {
          await sock.sendMessage(jid, { text: `_Uso: !clan tesoro donar <cantidad>_` }, { quoted: msg }); return
        }
        ClanManager.addToTreasury(ext, amount)
        patchUserData(sender, { money: user.money - amount })
        ClanManager.log(ext, `${pushName} donó ${amount} monedas`)
        await sock.sendMessage(jid, { text: `✅ Donaste *${amount.toLocaleString()} 💰* al tesoro.\nTesoro actual: *${ext.treasury.toLocaleString()}*` }, { quoted: msg })
        return
      }

      const income = ClanManager.calcTerritoryIncome(ext)
      await sock.sendMessage(jid, {
        text: [`*💰 TESORO DE [${myClan.tag}]*`, '', `Total: *${ext.treasury.toLocaleString()} monedas*`, `Ingresos territoriales: +${income}/hora`, `Tasa de impuesto: ${ext.taxRate}%`].join('\n'),
      }, { quoted: msg })
      return
    }

    // ── Territorios ──────────────────────────────────────────────────────────
    if (sub === 'territorios' || sub === 'territory') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      const action = (args[1] ?? '').toLowerCase()

      if (!action || action === 'ver') {
        const lines = [`*🗺️ TERRITORIOS DE [${myClan.tag}]*`, '']
        for (const tId of ext.territories) {
          const t = ClanManager.getTerritory(tId)
          if (t) lines.push(`${t.emoji} *${t.name}* — +${t.income}/h`)
        }
        if (!ext.territories.length) lines.push('_Ningún territorio conquistado._')
        lines.push('', `Total: ${ClanManager.calcTerritoryIncome(ext)} monedas/hora`)
        lines.push('', `_!clan territorios lista — ver todos disponibles_`)
        await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
        return
      }

      if (action === 'lista') {
        const lines = ['*🗺️ TODOS LOS TERRITORIOS*', '']
        for (const t of TERRITORIES) {
          const owned = ext.territories.includes(t.id) ? ' ✅' : ''
          lines.push(`${t.emoji} \`${t.id}\` ${t.name} — ${t.income}/h${owned}`)
        }
        await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
        return
      }

      if (action === 'conquistar' || action === 'conquer') {
        if (myRank !== 'líder' && myRank !== 'coleader') {
          await sock.sendMessage(jid, { text: `❌ Solo líder/coleader puede conquistar.` }, { quoted: msg }); return
        }
        const tId = args[2] ?? ''
        const t   = ClanManager.getTerritory(tId)
        if (!t) { await sock.sendMessage(jid, { text: `❌ Territorio no encontrado. Ver: !clan territorios lista` }, { quoted: msg }); return }

        const cost = t.income * 10
        if (!ClanManager.deductFromTreasury(ext, cost)) {
          await sock.sendMessage(jid, { text: `❌ El tesoro necesita *${cost} monedas*. Tiene ${ext.treasury}.` }, { quoted: msg }); return
        }

        const ok = ClanManager.conquer(ext, tId)
        if (!ok) { await sock.sendMessage(jid, { text: `_Ya controlas ese territorio._` }, { quoted: msg }); return }
        ClanManager.log(ext, `Territorio ${t.name} conquistado`)
        await sock.sendMessage(jid, { text: `${t.emoji} *${t.name}* conquistado! +${t.income}/hora al tesoro.` }, { quoted: msg })
        return
      }
    }

    // ── Guerra ────────────────────────────────────────────────────────────────
    if (sub === 'guerra' || sub === 'war') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      const action = (args[1] ?? '').toLowerCase()

      if (!action || action === 'ver') {
        const active = ext.wars.find(w => w.result === 'active')
        if (!active) { await sock.sendMessage(jid, { text: `_Sin guerra activa.\n!clan guerra declarar <TAG> para atacar._` }, { quoted: msg }); return }
        const left = Math.ceil((active.endTime - Date.now()) / 3_600_000)
        await sock.sendMessage(jid, {
          text: [`*⚔️ GUERRA ACTIVA*`, `Contra: [${active.enemy}]`, `Bajas nuestras: ${active.kills} | Enemigas: ${active.enemyKills}`, `Tiempo restante: ${left}h`].join('\n'),
        }, { quoted: msg })
        return
      }

      if (action === 'declarar' || action === 'attack') {
        if (myRank !== 'líder') { await sock.sendMessage(jid, { text: `❌ Solo el líder puede declarar guerra.` }, { quoted: msg }); return }
        const enemyTag = (args[2] ?? '').toUpperCase()
        const enemy    = getClan(enemyTag)
        if (!enemy) { await sock.sendMessage(jid, { text: `❌ Clan [${enemyTag}] no encontrado.` }, { quoted: msg }); return }

        const check = ClanManager.canStartWar(ext)
        if (!check.ok) { await sock.sendMessage(jid, { text: `❌ ${check.reason}` }, { quoted: msg }); return }

        const war = ClanManager.startWar(ext, enemyTag)
        ClanManager.log(ext, `Guerra declarada contra [${enemyTag}]`)
        await sock.sendMessage(jid, {
          text: [`⚔️ *¡GUERRA DECLARADA!*`, `[${myClan.tag}] vs [${enemyTag}]`, `Duración: 24h`, `_!clan guerra ver para ver el estado_`].join('\n'),
        }, { quoted: msg })
        return
      }

      if (action === 'historial') {
        const finished = ext.wars.filter(w => w.result !== 'active')
        if (!finished.length) { await sock.sendMessage(jid, { text: `_Sin historial de guerras._` }, { quoted: msg }); return }
        const lines = ['*⚔️ HISTORIAL DE GUERRAS*', '']
        for (const w of finished.slice(-5)) {
          const icon = w.result === 'win' ? '✅' : w.result === 'loss' ? '❌' : '⚖️'
          lines.push(`${icon} vs [${w.enemy}] — ${w.kills}:${w.enemyKills}`)
        }
        await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
        return
      }
    }

    // ── Alianzas ──────────────────────────────────────────────────────────────
    if (sub === 'alianza' || sub === 'alliance') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      const action   = (args[1] ?? '').toLowerCase()
      const tagArg   = (args[2] ?? '').toUpperCase()

      if (!action) {
        await sock.sendMessage(jid, {
          text: `*🤝 Alianzas de [${myClan.tag}]:*\n${ext.alliances.join(', ') || 'Ninguna'}`,
        }, { quoted: msg })
        return
      }

      if (action === 'proponer') {
        if (myRank !== 'líder') { await sock.sendMessage(jid, { text: `❌ Solo el líder puede proponer alianzas.` }, { quoted: msg }); return }
        const enemy = getClan(tagArg)
        if (!enemy) { await sock.sendMessage(jid, { text: `❌ Clan no encontrado.` }, { quoted: msg }); return }
        const r = ClanManager.ally(ext, tagArg)
        if (!r.ok) { await sock.sendMessage(jid, { text: `❌ ${r.reason}` }, { quoted: msg }); return }
        ClanManager.log(ext, `Alianza formada con [${tagArg}]`)
        await sock.sendMessage(jid, { text: `🤝 ¡Alianza formada con *${enemy.name}* [${tagArg}]!` }, { quoted: msg })
        return
      }

      if (action === 'romper') {
        if (myRank !== 'líder') { await sock.sendMessage(jid, { text: `❌ Solo el líder puede romper alianzas.` }, { quoted: msg }); return }
        ClanManager.breakAlliance(ext, tagArg)
        ClanManager.log(ext, `Alianza rota con [${tagArg}]`)
        await sock.sendMessage(jid, { text: `💔 Alianza con [${tagArg}] rota.` }, { quoted: msg })
        return
      }
    }

    // ── Log de actividad ──────────────────────────────────────────────────────
    if (sub === 'log' || sub === 'actividad') {
      if (!myClan || !ext) { await sock.sendMessage(jid, { text: `_No perteneces a ningún clan._` }, { quoted: msg }); return }
      if (!ext.log.length) { await sock.sendMessage(jid, { text: `_Sin actividad registrada._` }, { quoted: msg }); return }
      await sock.sendMessage(jid, {
        text: `*📋 LOG DE ACTIVIDAD [${myClan.tag}]*\n\n${ext.log.slice(0, 10).join('\n')}`,
      }, { quoted: msg })
      return
    }

    // ── Ranking de clanes ─────────────────────────────────────────────────────
    if (sub === 'ranking' || sub === 'top') {
      const ranked = [...clanData.values()]
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .slice(0, 10)
      if (!ranked.length) { await sock.sendMessage(jid, { text: `_No hay clanes aún._` }, { quoted: msg }); return }
      const medals = ['🥇', '🥈', '🥉']
      const lines  = ['*⚔️ RANKING DE CLANES*', '']
      ranked.forEach((c, i) => {
        lines.push(`${medals[i] ?? `${i + 1}.`} ${c.icon} *${c.name}* [${c.tag}] — Lv.${c.level} — ${c.members.length} miembros`)
      })
      await sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg })
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*⚔️ SISTEMA DE CLANES*

*Básico:*
> !clan crear <TAG> <Nombre> — Crear clan
> !clan info [TAG] — Ver info del clan
> !clan miembros — Ver lista de miembros
> !clan invitar @user — Invitar a alguien
> !clan solicitar <TAG> — Pedir unirse
> !clan salir — Abandonar el clan

*Gestión:*
> !clan rango @user <rango> — Cambiar rango
> !clan tesoro donar <N> — Donar al tesoro
> !clan log — Historial de actividad

*Territorios:*
> !clan territorios — Ver territorios propios
> !clan territorios lista — Todos disponibles
> !clan territorios conquistar <id>

*Guerras y Alianzas:*
> !clan guerra declarar <TAG>
> !clan alianza proponer <TAG>

> !clan ranking — Top 10 clanes`,
    }, { quoted: msg })
  },
}

export default command
