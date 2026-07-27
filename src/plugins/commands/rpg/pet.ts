import type { Command, DragonDef } from '../../../types/index.js'
import type { OwnedDragon } from '@core/events.js'
import { getUserData, patchUserData } from '@core/events.js'
import {
  getDragons, findDragon, pickRandomDragon,
  expForLevel, stageForLevel, imageForStage, videoForStage,
  goldPerMinute, pendingGold, translatedDesc, generateEggShakeVideo, transcodeToMp4,
  HATCH_COST_MONEY, FEED_EXP, feedCostOro,
  STAGE3_LEVEL,
} from '@lib/dragoncity.js'
import { downloadBuffer } from '@lib/downloader.js'
import { safeSend } from '@lib/media_sender.js'

const STAGE_EMOJI: Record<1 | 3, string> = { 1: '🐲', 3: '🐉' }

function stageLabel(stage: 1 | 3): string {
  return stage === 3 ? 'Adulto' : 'Joven'
}

// ─── Resolver un dragón de la colección del usuario por índice o nombre ──────
function resolveOwned(dragons: OwnedDragon[], query: string): { dragon: OwnedDragon; index: number } | null {
  const asIndex = Number(query)
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= dragons.length) {
    return { dragon: dragons[asIndex - 1]!, index: asIndex - 1 }
  }
  const needle = query.toLowerCase().trim()
  const index  = dragons.findIndex(d => d.name.toLowerCase() === needle)
  if (index === -1) return null
  return { dragon: dragons[index]!, index }
}

/** Sube de nivel un dragón consumiendo `exp`, devolviendo si evolucionó a la etapa final. */
function applyExp(dragon: OwnedDragon, exp: number): { leveled: boolean; evolvedToFinal: boolean } {
  const oldLevel  = dragon.level
  const wasStage3 = dragon.stage === 3
  dragon.exp += exp
  while (dragon.exp >= expForLevel(dragon.level)) {
    dragon.exp -= expForLevel(dragon.level)
    dragon.level++
  }
  dragon.stage = stageForLevel(dragon.level)
  return { leveled: dragon.level > oldLevel, evolvedToFinal: !wasStage3 && dragon.stage === 3 }
}

const command: Command = {
  name:        'pet',
  aliases:     ['mascota', 'mipet', 'dragon', 'dragones'],
  description: 'Sistema de dragones (Dragon City)  |  !pet <subcomando>',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName, prefix }) {
    const sub  = (args[0] ?? '').toLowerCase()
    const user = getUserData(sender, pushName)

    // ── view / lista de la colección ──────────────────────────────────────────
    if (!sub || sub === 'view' || sub === 'ver' || sub === 'list' || sub === 'lista' || sub === 'coleccion') {
      if (!user.dragons.length) {
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            `╭─「 🐉 DRAGONES 」`,
            `│`,
            `│ Todavía no tenés ningún dragón.`,
            `│`,
            `> ${prefix}pet hatch — conseguí tu primer huevo (¥${HATCH_COST_MONEY.toLocaleString()})`,
            `╰─`,
          ].join('\n'),
        }, { quoted: msg }))
        return
      }

      const rows = user.dragons.slice(0, 25).map((d, i) => {
        const pending = pendingGold(d.level, d.lastCollect)
        return `│ ${STAGE_EMOJI[d.stage]} \`${i + 1}\` *${d.name}* — Nv.${d.level} · ${stageLabel(d.stage)}` +
               (pending > 0 ? `  (+${pending.toLocaleString()} oro)` : '')
      })
      const extra = user.dragons.length > 25 ? [`│`, `│ … y ${user.dragons.length - 25} más`] : []

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 🐉 DRAGONES — ${user.dragons.length} 」`,
          `│`,
          ...rows,
          ...extra,
          `│`,
          `> Oro » *${user.oro.toLocaleString()}*`,
          `> ${prefix}pet info <#|nombre> — ver detalle`,
          `> ${prefix}pet feed <#|nombre> — alimentar`,
          `> ${prefix}pet collect — cobrar oro acumulado`,
          `> ${prefix}pet hatch — nuevo huevo (¥${HATCH_COST_MONEY.toLocaleString()})`,
          `╰─`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── hatch — conseguir un nuevo dragón ─────────────────────────────────────
    if (sub === 'hatch' || sub === 'incubar' || sub === 'huevo') {
      if (user.money < HATCH_COST_MONEY) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Necesitás *¥${HATCH_COST_MONEY.toLocaleString()}* para un huevo. Tenés ¥${user.money.toLocaleString()}.`,
        }, { quoted: msg }))
        return
      }

      let dragons: DragonDef[]
      try {
        dragons = await getDragons()
      } catch {
        dragons = []
      }
      if (!dragons.length) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ No se pudo conectar con el catálogo de dragones. Probá de nuevo en un rato.`,
        }, { quoted: msg }))
        return
      }

      const picked = pickRandomDragon(dragons)

      // ── mensaje 1: el huevo "temblando" — video generado al vuelo con
      // ffmpeg a partir de la imagen estática (la fuente no trae ningún
      // asset animado para este momento, solo para las evoluciones) ────────
      try {
        const eggImgUrl = imageForStage(picked, 0)
        const eggBuffer = eggImgUrl ? await downloadBuffer(eggImgUrl) : null
        const shakeVideo = eggBuffer ? await generateEggShakeVideo(eggBuffer) : null
        if (shakeVideo) {
          await safeSend(() => sock.sendMessage(jid, {
            video:   shakeVideo,
            caption: '🥚 Un huevo está a punto de romperse...',
            gifPlayback: true,
          }, { quoted: msg }))
        } else {
          await safeSend(() => sock.sendMessage(jid, { text: '🥚 Un huevo está a punto de romperse...' }, { quoted: msg }))
        }
      } catch {
        await safeSend(() => sock.sendMessage(jid, { text: '🥚 Un huevo está a punto de romperse...' }, { quoted: msg }))
      }

      // ── registrar el dragón — arranca directo en etapa 1 (recién nacido) ─
      const owned: OwnedDragon = {
        id:          picked.id,
        slug:        picked.slug,
        name:        picked.name,
        level:       1,
        exp:         0,
        stage:       1,
        hatchedAt:   Date.now(),
        lastCollect: Date.now(),
      }
      patchUserData(sender, { money: user.money - HATCH_COST_MONEY, dragons: [...user.dragons, owned] })

      // ── mensaje 2: revelación — video real de la etapa 1, con la info ────
      const newIndex = user.dragons.length + 1
      const caption = [
        `🐣 *¡Nació ${picked.name}!*`,
        `${picked.rarity} · ${picked.elements.join('/')}`,
        ``,
        `> +${goldPerMinute(1)} oro/min en este nivel`,
        `> ${prefix}pet feed ${newIndex} — para alimentarlo y subirlo de nivel`,
      ].join('\n')

      let sentMedia = false
      try {
        const vidUrl = videoForStage(picked, 1)
        const webm   = vidUrl ? await downloadBuffer(vidUrl) : null
        const buffer = webm ? await transcodeToMp4(webm) : null
        if (buffer) {
          await safeSend(() => sock.sendMessage(jid, { video: buffer, caption, gifPlayback: true }, { quoted: msg }))
          sentMedia = true
        }
      } catch { /* cae a imagen abajo */ }

      if (!sentMedia) {
        try {
          const imgUrl = imageForStage(picked, 1)
          const buffer = imgUrl ? await downloadBuffer(imgUrl) : null
          if (buffer) {
            await safeSend(() => sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg }))
            sentMedia = true
          }
        } catch { /* cae a texto abajo */ }
      }

      if (!sentMedia) {
        await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
      }
      return
    }

    // ── feed — alimentar con Oro para ganar experiencia ───────────────────────
    if (sub === 'feed' || sub === 'alimentar' || sub === 'comer') {
      const query = args.slice(1).join(' ').trim()
      if (!query) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Uso: \`${prefix}pet feed <#|nombre>\``,
        }, { quoted: msg }))
        return
      }
      const found = resolveOwned(user.dragons, query)
      if (!found) {
        await safeSend(() => sock.sendMessage(jid, { text: `✗ No tenés ningún dragón así.` }, { quoted: msg }))
        return
      }

      const { dragon, index } = found
      const cost = feedCostOro(dragon.level)
      if (user.oro < cost) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Necesitás *${cost.toLocaleString()} oro* para alimentar a *${dragon.name}*. Tenés ${user.oro.toLocaleString()}.\n> ${prefix}pet collect — para cobrar el oro acumulado`,
        }, { quoted: msg }))
        return
      }

      const { leveled, evolvedToFinal } = applyExp(dragon, FEED_EXP)
      const dragons = [...user.dragons]
      dragons[index] = dragon
      patchUserData(sender, { oro: user.oro - cost, dragons })

      // ── evolución final — se muestra el video una sola vez, al momento exacto ─
      if (evolvedToFinal) {
        let def
        try { def = await findDragon(dragon.id) } catch { def = undefined }
        const vidUrl = def ? videoForStage(def, 3) : undefined
        const caption = [
          `✨ *¡${dragon.name} evolucionó!*`,
          `${STAGE_EMOJI[3]} Ahora es ${stageLabel(3)} · Nv.${dragon.level}`,
          `> +${goldPerMinute(dragon.level)} oro/min`,
        ].join('\n')

        try {
          const webm   = vidUrl ? await downloadBuffer(vidUrl) : null
          const buffer = webm ? await transcodeToMp4(webm) : null
          if (buffer) {
            await safeSend(() => sock.sendMessage(jid, { video: buffer, caption, gifPlayback: true }, { quoted: msg }))
          } else {
            await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
          }
        } catch {
          await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
        }
        return
      }

      let text = `🍖 Alimentaste a *${dragon.name}*  (-${cost.toLocaleString()} oro, +${FEED_EXP} EXP)`
      if (leveled) text += `\n⬆️ *¡${dragon.name} subió al nivel ${dragon.level}!*`
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    // ── collect — cobrar oro acumulado de todos los dragones ─────────────────
    if (sub === 'collect' || sub === 'recolectar' || sub === 'cobrar') {
      if (!user.dragons.length) {
        await safeSend(() => sock.sendMessage(jid, { text: `✗ No tenés dragones todavía.` }, { quoted: msg }))
        return
      }

      const now = Date.now()
      let total = 0
      const rows: string[] = []

      const updated = user.dragons.map(d => {
        const income = pendingGold(d.level, d.lastCollect)
        if (income > 0) {
          total += income
          rows.push(`│ ${STAGE_EMOJI[d.stage]} \`${d.name}\`  +${income.toLocaleString()} oro`)
        }
        return { ...d, lastCollect: now }
      })

      if (total <= 0) {
        await safeSend(() => sock.sendMessage(jid, { text: `✗ Todavía no acumulaste oro — volvé en un rato.` }, { quoted: msg }))
        return
      }

      patchUserData(sender, { oro: user.oro + total, dragons: updated })

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 🪙 ORO COBRADO 」`,
          `│`,
          ...rows,
          `│`,
          `> Total  +${total.toLocaleString()} oro`,
          `> Balance ${(user.oro + total).toLocaleString()} oro`,
          `╰─`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── info — detalle de un dragón (propio o del catálogo) ──────────────────
    if (sub === 'info') {
      const query = args.slice(1).join(' ').trim()
      if (!query) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Uso: \`${prefix}pet info <#|nombre>\` (de tu colección) o \`${prefix}pet info <nombre-dragón>\` (del catálogo)`,
        }, { quoted: msg }))
        return
      }

      const owned = resolveOwned(user.dragons, query)
      let def
      try {
        def = await findDragon(owned ? owned.dragon.slug : query)
      } catch { def = undefined }

      if (!def) {
        await safeSend(() => sock.sendMessage(jid, { text: `✗ No se encontró ningún dragón así.` }, { quoted: msg }))
        return
      }

      const desc  = await translatedDesc(def)
      const stage = owned ? owned.dragon.stage : 3
      const skills = def.habilidad.slice(0, 4)
        .map(s => `│ ${s.trainable ? '★' : '☆'} ${s.name} (${s.element}, ${s.power})`)

      const caption = [
        `╭─「 🐉 ${def.name} 」`,
        `│`,
        `│ ${def.rarity} · ${def.elements.join('/')}`,
        ...(owned ? [
          `│ Nv.${owned.dragon.level} · ${stageLabel(owned.dragon.stage)}`,
          `│ +${goldPerMinute(owned.dragon.level)} oro/min`,
        ] : []),
        `│`,
        `> ${desc}`,
        ...(skills.length ? [`│`, `│ ⚡ Habilidades:`, ...skills] : []),
        `│`,
        ...(owned
          ? [`> ${prefix}pet feed ${owned.index + 1} — alimentar`, `> ${prefix}pet collect — cobrar oro acumulado`]
          : [`> ${prefix}pet hatch — conseguí tu propio huevo (¥${HATCH_COST_MONEY.toLocaleString()})`]),
        `╰─`,
      ].join('\n')

      // El video real (stage 1/3) se muestra en loop como GIF — mucho más
      // vivo que la imagen estática, y ya lo tenemos descargado igual para
      // el momento de nacer/evolucionar.
      let sentMedia = false
      try {
        const vidUrl = videoForStage(def, stage)
        const webm   = vidUrl ? await downloadBuffer(vidUrl) : null
        const buffer = webm ? await transcodeToMp4(webm) : null
        if (buffer) {
          await safeSend(() => sock.sendMessage(jid, { video: buffer, caption, gifPlayback: true }, { quoted: msg }))
          sentMedia = true
        }
      } catch { /* cae a imagen abajo */ }

      if (!sentMedia) {
        try {
          const imgUrl = imageForStage(def, stage)
          const buffer = imgUrl ? await downloadBuffer(imgUrl) : null
          if (buffer) {
            await safeSend(() => sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg }))
            sentMedia = true
          }
        } catch { /* cae a texto abajo */ }
      }

      if (!sentMedia) {
        await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
      }
      return
    }

    // ── rename — renombrar un dragón propio ───────────────────────────────────
    if (sub === 'rename' || sub === 'renombrar') {
      const query   = args[1]
      const newName = args.slice(2).join(' ').trim()
      if (!query || !newName || newName.length > 24) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `✗ Uso: \`${prefix}pet rename <#|nombre-actual> <nombre-nuevo>\`  (máx 24 caracteres)`,
        }, { quoted: msg }))
        return
      }
      const found = resolveOwned(user.dragons, query)
      if (!found) {
        await safeSend(() => sock.sendMessage(jid, { text: `✗ No tenés ningún dragón así.` }, { quoted: msg }))
        return
      }
      const oldName = found.dragon.name
      const dragons = [...user.dragons]
      dragons[found.index] = { ...found.dragon, name: newName }
      patchUserData(sender, { dragons })
      await safeSend(() => sock.sendMessage(jid, { text: `✏️ *${oldName}* ahora se llama *${newName}*.` }, { quoted: msg }))
      return
    }

    // ── release / liberar ─────────────────────────────────────────────────────
    if (sub === 'release' || sub === 'liberar' || sub === 'soltar') {
      const query = args.slice(1).join(' ').trim()
      const found = resolveOwned(user.dragons, query)
      if (!found) {
        await safeSend(() => sock.sendMessage(jid, { text: `✗ Uso: \`${prefix}pet release <#|nombre>\`` }, { quoted: msg }))
        return
      }
      const dragons = user.dragons.filter((_, i) => i !== found.index)
      patchUserData(sender, { dragons })
      await safeSend(() => sock.sendMessage(jid, {
        text: `💔 Te despediste de *${found.dragon.name}*. Fue un buen compañero.`,
      }, { quoted: msg }))
      return
    }

    // ── ayuda ──────────────────────────────────────────────────────────────────
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 🐉 DRAGON CITY 」`,
        `│`,
        `│ \`${prefix}pet\`                    — ver tu colección`,
        `│ \`${prefix}pet hatch\`              — nuevo huevo (¥${HATCH_COST_MONEY.toLocaleString()})`,
        `│ \`${prefix}pet feed <#|nombre>\`    — alimentar (con oro)`,
        `│ \`${prefix}pet collect\`            — cobrar oro acumulado`,
        `│ \`${prefix}pet info <#|nombre>\`    — detalle de un dragón`,
        `│ \`${prefix}pet rename <#> <nombre>\` — renombrar`,
        `│ \`${prefix}pet release <#|nombre>\`  — liberar`,
        `│`,
        `> Los dragones nacen ya en su forma joven, evolucionan a su forma final en nivel ${STAGE3_LEVEL}, y generan oro pasivo según su nivel.`,
        `╰─`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
