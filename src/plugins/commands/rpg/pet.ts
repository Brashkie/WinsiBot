import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import {
  PetManager,
  PET_SPECIES,
  RARITY_EMOJI,
  type PetFullData,
  type PetRarity,
  type PetSpecies,
} from '@lib/petAdvanced.js'
import { safeSend } from '@lib/media_sender.js'
import { sendButton } from '@lib/interactive.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPet(jid: string): PetFullData | undefined {
  return getUserData(jid).petFull
}

const fmtMs = (ms: number): string => {
  const s = Math.ceil(ms / 1_000)
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
}

// ─── Adventure zones ──────────────────────────────────────────────────────────

const ZONES = [
  { id: 'forest',   name: 'Bosque Encantado', emoji: '🌲', minGold: 200, maxGold: 800,  minXp: 20, maxXp: 50  },
  { id: 'cave',     name: 'Caverna Oscura',   emoji: '🕳️', minGold: 400, maxGold: 1200, minXp: 30, maxXp: 70  },
  { id: 'ocean',    name: 'Mar Profundo',     emoji: '🌊', minGold: 300, maxGold: 1000, minXp: 25, maxXp: 60  },
  { id: 'volcano',  name: 'Volcán Ardiente',  emoji: '🌋', minGold: 600, maxGold: 2000, minXp: 40, maxXp: 90  },
  { id: 'sky',      name: 'Cielo Eterno',     emoji: '☁️', minGold: 800, maxGold: 2500, minXp: 50, maxXp: 100 },
] as const

type ZoneId = (typeof ZONES)[number]['id']

const ZONE_MAP = Object.fromEntries(ZONES.map(z => [z.id, z])) as Record<ZoneId, typeof ZONES[number]>

// ─── Command ──────────────────────────────────────────────────────────────────

const command: Command = {
  name:        'pet',
  aliases:     ['mascota', 'mipet'],
  description: 'Sistema avanzado de mascotas  |  !pet <subcomando>',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName, prefix }) {
    const mentioned = (msg as any).message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined ?? []
    const sub  = (args[0] ?? '').toLowerCase()
    const user = getUserData(sender, pushName)
    const now  = Date.now()

    // ── view / active — panel interactivo con botones ────────────────────────
    if (!sub || sub === 'view' || sub === 'active' || sub === 'ver' || sub === 'status' || sub === 'estado') {
      const target     = mentioned[0] ?? sender
      const targetUser = getUserData(target)
      const pet        = targetUser.petFull
      const isOwn      = target === sender

      if (!pet) {
        const who = isOwn ? 'No tienes mascota activa.' : `@${target.split('@')[0]} no tiene mascota.`
        await safeSend(() => sock.sendMessage(jid, {
          text: `> ${who}\n> Usa \`${prefix}pet adoptar\` para conseguir una. Costo: ¥500`,
          mentions: !isOwn ? [target] : [],
        }, { quoted: msg }))
        return
      }

      PetManager.decayStats(pet)
      patchUserData(target, { petFull: pet })

      const species  = PetManager.getSpecies(pet.speciesId)
      const expNeeded = pet.level * 100
      const rarityStars: Record<string, string> = {
        common: '⭐☆☆☆☆', uncommon: '⭐⭐☆☆☆', rare: '⭐⭐⭐☆☆',
        epic: '⭐⭐⭐⭐☆', legendary: '⭐⭐⭐⭐⭐',
      }
      const stars = rarityStars[species?.rarity ?? 'common'] ?? '⭐☆☆☆☆'

      const bodyText = [
        `${species?.emoji ?? '🐾'} *${pet.name}*`,
        `Nivel: ${pet.level} (${pet.exp}/${expNeeded} XP)`,
        `Estrellas: ${stars}`,
        ``,
        `🩷 Cariño  ${makeBar(pet.happiness, 100, 6)}`,
        `🍖 Hambre  ${makeBar(pet.hunger, 100, 6)}`,
        `🛁 Higiene ${makeBar(pet.lastCleaned ? Math.min(100, Math.max(0, 100 - Math.floor((Date.now() - pet.lastCleaned) / 72_000))) : 50, 100, 6)}`,
      ].join('\n')

      // Cuando se ve la mascota de otro → solo texto, sin botones de acción
      if (!isOwn) {
        await safeSend(() => sock.sendMessage(jid, { text: bodyText }, { quoted: msg }))
        return
      }

      await sendButton(
        sock, jid,
        `🐾 Mascota de @${sender.split('@')[0]}\n\n${bodyText}`,
        'Selecciona una acción',
        [
          { text: '🎮 Jugar',         id: `${prefix}pet play`    },
          { text: '🍖 Alimentar',      id: `${prefix}pet feed`    },
          { text: '🛁 Limpiar',        id: `${prefix}pet clean`   },
          { text: '🏋️ Entrenar',       id: `${prefix}pet explore` },
          { text: '✏️ Cambiar nombre', id: `${prefix}pet rename`  },
        ],
        { quoted: msg },
      )
      return
    }

    // ── stats — estadísticas detalladas ───────────────────────────────────────
    if (sub === 'stats' || sub === 'estadisticas') {
      const pet = getPet(sender)
      if (!pet) {
        await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg }))
        return
      }
      PetManager.decayStats(pet)
      patchUserData(sender, { petFull: pet })

      const species = PetManager.getSpecies(pet.speciesId)
      const expNeeded = pet.level * 100
      const hpBar  = makeBar(pet.hp, pet.maxHp)
      const hunBar = makeBar(pet.hunger, 100)
      const hapBar = makeBar(pet.happiness, 100)
      const enBar  = makeBar(pet.energy, 100)

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `${species?.emoji ?? '🐾'} *${pet.name}* — ${species?.name ?? pet.speciesId}`,
          `${RARITY_EMOJI[(species?.rarity ?? 'common') as PetRarity]} Nivel ${pet.level}  ·  Gen ${pet.generation}`,
          ``,
          `❤️ HP       ${hpBar} ${pet.hp}/${pet.maxHp}`,
          `⚔️ ATK      ${pet.atk}`,
          `🛡️ DEF      ${pet.def}`,
          `✨ EXP      ${pet.exp}/${expNeeded}`,
          ``,
          `🍖 Hambre   ${hunBar} ${pet.hunger}/100`,
          `😊 Felicidad ${hapBar} ${pet.happiness}/100`,
          `⚡ Energía  ${enBar} ${pet.energy}/100`,
          ``,
          `🏆 Batallas  ${pet.wins}V  ${pet.losses}D`,
          species?.evolvesAt ? `✨ Evoluciona en nivel ${species.evolvesAt[0]}` : '',
        ].filter(Boolean).join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── info — info de especie ────────────────────────────────────────────────
    if (sub === 'info') {
      const query   = args[1]?.toLowerCase()
      let species: PetSpecies | undefined

      if (query) {
        species = PetManager.getSpecies(query) ?? PET_SPECIES.find(s => s.name.toLowerCase().includes(query))
        if (!species) {
          await safeSend(() => sock.sendMessage(jid, {
            text: `> No se encontró la especie \`${query}\`. Usa \`${prefix}pet list\` para ver todas.`,
          }, { quoted: msg }))
          return
        }
      } else {
        const pet = getPet(sender)
        if (!pet) {
          await safeSend(() => sock.sendMessage(jid, {
            text: `> No tienes mascota. Usa \`${prefix}pet info <especie>\` para ver cualquier especie.`,
          }, { quoted: msg }))
          return
        }
        species = PetManager.getSpecies(pet.speciesId)!
      }

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `${species!.emoji} *${species!.name}*  ·  ID: \`${species!.id}\``,
          `${RARITY_EMOJI[species!.rarity]} ${species!.rarity.toUpperCase()}`,
          ``,
          `_${species!.desc}_`,
          ``,
          `⚔️ ATK base  ${species!.baseAtk}`,
          `🛡️ DEF base  ${species!.baseDef}`,
          `❤️ HP base   ${species!.baseHp}`,
          species!.evolvesAt ? `✨ Evoluciona al nivel ${species!.evolvesAt[0]}` : '✦ No evoluciona',
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── list — catálogo ───────────────────────────────────────────────────────
    if (sub === 'list' || sub === 'lista' || sub === 'catalogo' || sub === 'especies') {
      const filterRarity = (args[1] ?? '') as PetRarity
      const filtered: PetSpecies[] = filterRarity
        ? PET_SPECIES.filter(s => s.rarity === filterRarity)
        : [...PET_SPECIES]

      const by: Record<string, PetSpecies[]> = {}
      for (const s of filtered) {
        if (!by[s.rarity]) by[s.rarity] = []
        by[s.rarity]!.push(s)
      }

      const lines = ['🐾 *CATÁLOGO DE MASCOTAS*', '']
      for (const [rarity, list] of Object.entries(by)) {
        lines.push(`${RARITY_EMOJI[rarity as PetRarity]} *${rarity.toUpperCase()}*`)
        for (const s of list) {
          const evo = s.evolvesAt ? ` → lv.${s.evolvesAt[0]}` : ''
          lines.push(`  ${s.emoji} \`${s.id}\` — ${s.name}${evo}`)
        }
        lines.push('')
      }
      lines.push(`_${prefix}pet adoptar <id> <nombre>_`)
      await safeSend(() => sock.sendMessage(jid, { text: lines.join('\n').trimEnd() }, { quoted: msg }))
      return
    }

    // ── adoptar ───────────────────────────────────────────────────────────────
    if (sub === 'adoptar' || sub === 'nueva' || sub === 'conseguir') {
      if (user.petFull) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Ya tienes una mascota: *${user.petFull!.name}*. Usa \`${prefix}pet disown\` para liberarla.`,
        }, { quoted: msg }))
        return
      }

      const cost = 500
      if (user.money < cost) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Necesitas *¥${cost}* para adoptar. Tienes ¥${user.money.toLocaleString()}.`,
        }, { quoted: msg }))
        return
      }

      const speciesId = (args[1] ?? '').toLowerCase()
      const name      = args.slice(speciesId ? 2 : 1).join(' ').trim() || 'Compañero'

      let species: PetSpecies
      if (speciesId && PetManager.getSpecies(speciesId)) {
        species = PetManager.getSpecies(speciesId)!
      } else {
        species = PetManager.randomSpecies()
      }

      const pet = PetManager.create(species, name)
      patchUserData(sender, { money: user.money - cost, petFull: pet })

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `🐾 *¡Nueva mascota adoptada!*`,
          ``,
          `${species.emoji} *${name}* — ${species.name}`,
          `${RARITY_EMOJI[species.rarity]} ${species.rarity.toUpperCase()}`,
          `_${species.desc}_`,
          ``,
          `⚔️ ATK: ${species.baseAtk}  🛡️ DEF: ${species.baseDef}  ❤️ HP: ${species.baseHp}`,
          species.evolvesAt ? `✨ Evoluciona al nivel ${species.evolvesAt[0]}` : '',
        ].filter(Boolean).join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── feed — alimentar ──────────────────────────────────────────────────────
    if (sub === 'feed' || sub === 'alimentar' || sub === 'comer') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }
      PetManager.decayStats(pet)
      const msg2 = PetManager.feed(pet)
      const { leveled, evolved } = PetManager.addExp(pet, 5)
      patchUserData(sender, { petFull: pet })

      let text = msg2
      if (leveled) text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
      if (evolved) text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    // ── play — jugar ──────────────────────────────────────────────────────────
    if (sub === 'play' || sub === 'jugar') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }
      PetManager.decayStats(pet)
      const msg2 = PetManager.play(pet)
      const { leveled, evolved } = PetManager.addExp(pet, 8)
      patchUserData(sender, { petFull: pet })

      let text = msg2
      if (leveled) text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
      if (evolved) text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    // ── clean — bañar ─────────────────────────────────────────────────────────
    if (sub === 'clean' || sub === 'bañar' || sub === 'baño') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }

      const CD_CLEAN = 2 * 60 * 60_000 // 2h
      const lastCleaned = pet.lastCleaned ?? 0
      if (now - lastCleaned < CD_CLEAN) {
        const left = CD_CLEAN - (now - lastCleaned)
        await safeSend(() => sock.sendMessage(jid, {
          text: `> 🛁 ${pet.name} ya se bañó. Espera *${fmtMs(left)}*.`,
        }, { quoted: msg }))
        return
      }

      PetManager.decayStats(pet)
      const happinessGain = Math.floor(Math.random() * 10) + 10
      pet.happiness = Math.min(100, pet.happiness + happinessGain)
      pet.lastCleaned = now

      const { leveled, evolved } = PetManager.addExp(pet, 12)
      patchUserData(sender, { petFull: pet })

      const msgs = [
        `🛁 Le diste un baño a *${pet.name}*. ¡Quedó brillante!`,
        `🚿 *${pet.name}* chapoteó felizmente en la bañera.`,
        `🫧 Con mucho cuidado lavaste a *${pet.name}*. ¡Huele increíble!`,
        `🧼 *${pet.name}* al principio protestó, pero después disfrutó el baño.`,
      ]
      let text = msgs[Math.floor(Math.random() * msgs.length)]!
      text += `\n+${happinessGain} felicidad  +12 EXP`
      if (leveled) text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
      if (evolved) text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    // ── rename — renombrar ────────────────────────────────────────────────────
    if (sub === 'rename' || sub === 'renombrar') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }

      const newName = args.slice(1).join(' ').trim()
      if (!newName || newName.length < 1 || newName.length > 24) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `> Uso: \`${prefix}pet rename <nombre>\`  (máx 24 caracteres)`,
        }, { quoted: msg }))
        return
      }

      const oldName = pet.name
      pet.name = newName
      patchUserData(sender, { petFull: pet })
      await safeSend(() => sock.sendMessage(jid, {
        text: `✏️ *${oldName}* ahora se llama *${newName}*.`,
      }, { quoted: msg }))
      return
    }

    // ── explore — exploración rápida ──────────────────────────────────────────
    if (sub === 'explore' || sub === 'explorar') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }

      const CD_EXP = 60 * 60_000 // 1h
      const lastExplored = pet.lastExplored ?? 0
      if (now - lastExplored < CD_EXP) {
        const left = CD_EXP - (now - lastExplored)
        await safeSend(() => sock.sendMessage(jid, {
          text: `> 🗺️ ${pet.name} ya exploró. Espera *${fmtMs(left)}*.`,
        }, { quoted: msg }))
        return
      }

      PetManager.decayStats(pet)
      const gold = Math.floor(Math.random() * 400) + 100
      const xp   = Math.floor(Math.random() * 20) + 10
      pet.lastExplored = now
      pet.energy = Math.max(0, pet.energy - 15)

      const { leveled, evolved } = PetManager.addExp(pet, xp)
      patchUserData(sender, { petFull: pet, money: (getUserData(sender).money) + gold })

      const finds = [
        `encontró unas monedas enterradas bajo un árbol`,
        `descubrió un cofrecito abandonado con monedas`,
        `regresó con gemas y monedas que encontró en el camino`,
        `olfateó un escondite secreto lleno de oro`,
        `volvió con monedas brillantes en la boca`,
      ]
      let text = `🗺️ *${pet.name}* ${finds[Math.floor(Math.random() * finds.length)]}!\n\n¥${gold.toLocaleString()} CodPoints  +${xp} EXP`
      if (leveled) text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
      if (evolved) text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    // ── adventure — aventura por zonas ────────────────────────────────────────
    if (sub === 'adventure' || sub === 'aventura') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }

      const zoneArg = (args[1] ?? '').toLowerCase() as ZoneId

      // Sin zona → mostrar menú
      if (!zoneArg || !ZONE_MAP[zoneArg]) {
        const lines = [
          `⚔️ *AVENTURAS — ${pet.name}*`,
          ``,
          ...ZONES.map(z => `  ${z.emoji} \`${z.id}\`  *${z.name}*  ¥${z.minGold}-${z.maxGold}`),
          ``,
          `_${prefix}pet adventure <zona>_  (CD: 4h)`,
        ]
        await safeSend(() => sock.sendMessage(jid, { text: lines.join('\n') }, { quoted: msg }))
        return
      }

      const CD_ADV = 4 * 60 * 60_000 // 4h
      const lastAdventure = pet.lastAdventure ?? 0
      if (now - lastAdventure < CD_ADV) {
        const left = CD_ADV - (now - lastAdventure)
        await safeSend(() => sock.sendMessage(jid, {
          text: `> ⚔️ ${pet.name} necesita descansar. Espera *${fmtMs(left)}*.`,
        }, { quoted: msg }))
        return
      }

      const zone = ZONE_MAP[zoneArg]!
      PetManager.decayStats(pet)
      const gold = Math.floor(Math.random() * (zone.maxGold - zone.minGold + 1)) + zone.minGold
      const xp   = Math.floor(Math.random() * (zone.maxXp - zone.minXp + 1)) + zone.minXp
      const won  = Math.random() < 0.75  // 75% de ganar

      pet.lastAdventure = now
      pet.energy = Math.max(0, pet.energy - 30)

      if (won) {
        const { leveled, evolved } = PetManager.addExp(pet, xp)
        patchUserData(sender, { petFull: pet, money: getUserData(sender).money + gold })

        let text = [
          `${zone.emoji} *Aventura en ${zone.name}*`,
          ``,
          `*${pet.name}* venció a los enemigos y conquistó la zona!`,
          ``,
          `🏆 +¥${gold.toLocaleString()} CodPoints`,
          `✨ +${xp} EXP`,
        ].join('\n')
        if (leveled) text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
        if (evolved) text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
        await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      } else {
        const consolation = Math.floor(gold * 0.2)
        PetManager.addExp(pet, Math.floor(xp * 0.5))
        patchUserData(sender, { petFull: pet, money: getUserData(sender).money + consolation })

        await safeSend(() => sock.sendMessage(jid, {
          text: [
            `${zone.emoji} *Aventura en ${zone.name}*`,
            ``,
            `*${pet.name}* fue derrotado y tuvo que retirarse...`,
            ``,
            `💔 Perdiste la aventura`,
            `🪙 Consolación: ¥${consolation.toLocaleString()}`,
          ].join('\n'),
        }, { quoted: msg }))
      }
      return
    }

    // ── sleep — dormir ────────────────────────────────────────────────────────
    if (sub === 'sleep' || sub === 'dormir') {
      const pet = getPet(sender)
      if (!pet) { await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg })); return }
      PetManager.decayStats(pet)
      await safeSend(() => sock.sendMessage(jid, { text: PetManager.sleep(pet) }, { quoted: msg }))
      patchUserData(sender, { petFull: pet })
      return
    }

    // ── battle / fight ────────────────────────────────────────────────────────
    if (sub === 'battle' || sub === 'fight' || sub === 'batalla' || sub === 'pelear') {
      const target = mentioned[0]
      if (!target) {
        await safeSend(() => sock.sendMessage(jid, { text: `> Uso: \`${prefix}pet battle @usuario\`` }, { quoted: msg }))
        return
      }
      const myPet    = getPet(sender)
      const theirPet = getPet(target)
      if (!myPet || !theirPet) {
        await safeSend(() => sock.sendMessage(jid, {
          text: `❌ ${!myPet ? 'Tú no tienes' : `@${target.split('@')[0]} no tiene`} mascota.`,
          mentions: !myPet ? [] : [target],
        }, { quoted: msg }))
        return
      }

      const state = PetManager.startBattle(sender, target, myPet, theirPet)
      const lines = [
        `⚔️ *BATALLA DE MASCOTAS*`,
        `@${sender.split('@')[0]} (${myPet.name}) vs @${target.split('@')[0]} (${theirPet.name})`,
        ``,
      ]

      for (let i = 0; i < 10; i++) {
        const r = PetManager.autoRound(state)
        lines.push(`R${i + 1}: ${r.log}`)
        if (r.over) {
          const winJid  = r.winner!
          const loseJid = winJid === sender ? target : sender
          const winPet  = winJid === sender ? myPet : theirPet
          const losePet = loseJid === sender ? myPet : theirPet

          winPet.wins++
          losePet.losses++
          PetManager.addExp(winPet, 50)
          PetManager.addExp(losePet, 20)
          patchUserData(sender, { petFull: myPet })
          patchUserData(target,  { petFull: theirPet })

          lines.push('', `🏆 *¡${winPet.name} (${getUserData(winJid).name || winJid.split('@')[0]}) ganó!*`)
          await safeSend(() => sock.sendMessage(jid, { text: lines.join('\n'), mentions: [sender, target] }, { quoted: msg }))
          return
        }
      }

      patchUserData(sender, { petFull: myPet })
      patchUserData(target,  { petFull: theirPet })
      lines.push('', `⚖️ *¡Empate!*`)
      await safeSend(() => sock.sendMessage(jid, { text: lines.join('\n'), mentions: [sender, target] }, { quoted: msg }))
      return
    }

    // ── disown / liberar ──────────────────────────────────────────────────────
    if (sub === 'disown' || sub === 'liberar' || sub === 'release' || sub === 'soltar') {
      const pet = getPet(sender)
      if (!pet) {
        await safeSend(() => sock.sendMessage(jid, { text: `> No tienes mascota activa.` }, { quoted: msg }))
        return
      }
      const stored = getUserData(sender) as any
      delete stored.petFull
      await safeSend(() => sock.sendMessage(jid, {
        text: `💔 Te despediste de *${pet.name}*. Fue un buen compañero.`,
      }, { quoted: msg }))
      return
    }

    // ── ayuda ─────────────────────────────────────────────────────────────────
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `🐾 *SISTEMA DE MASCOTAS*`,
        ``,
        `§ \`${prefix}pet view\`              — ver mascota activa`,
        `§ \`${prefix}pet stats\`             — estadísticas detalladas`,
        `§ \`${prefix}pet info [especie]\`    — info de especie`,
        `§ \`${prefix}pet list\`              — catálogo de especies`,
        ``,
        `§ \`${prefix}pet adoptar [id] <nombre>\` — adoptar (¥500)`,
        `§ \`${prefix}pet feed\`              — alimentar`,
        `§ \`${prefix}pet play\`              — jugar`,
        `§ \`${prefix}pet clean\`             — bañar  (CD 2h)`,
        `§ \`${prefix}pet sleep\`             — dormir`,
        `§ \`${prefix}pet explore\`           — explorar  (CD 1h)`,
        `§ \`${prefix}pet adventure <zona>\`  — aventura  (CD 4h)`,
        ``,
        `§ \`${prefix}pet rename <nombre>\`   — renombrar`,
        `§ \`${prefix}pet battle @user\`      — batallar`,
        `§ \`${prefix}pet disown\`            — liberar mascota`,
        ``,
        `_Las mascotas evolucionan al alcanzar ciertos niveles._`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function makeBar(val: number, max: number, len = 8): string {
  const filled = Math.round((val / max) * len)
  return '█'.repeat(filled) + '░'.repeat(len - filled)
}
