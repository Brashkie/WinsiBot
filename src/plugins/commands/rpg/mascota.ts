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

function getPet(jid: string): PetFullData | undefined {
  return getUserData(jid).petFull
}

const command: Command = {
  name:        'mascota',
  aliases:     ['pet', 'mipet'],
  description: 'Sistema avanzado de mascotas con evolución y batallas',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const mentioned = (msg as any).message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined ?? []
    const sub  = (args[0] ?? '').toLowerCase()
    const user = getUserData(sender, pushName)

    // ── Adoptar ───────────────────────────────────────────────────────────────
    if (sub === 'adoptar' || sub === 'nueva' || sub === 'conseguir') {
      if (user.petFull) {
        await sock.sendMessage(jid, { text: `_Ya tienes una mascota: *${user.petFull.name}*. Usa !mascota liberar para soltarla._` }, { quoted: msg })
        return
      }

      const cost = 500
      if (user.money < cost) {
        await sock.sendMessage(jid, { text: `❌ Necesitas *${cost} monedas* para adoptar. Tienes ${user.money}.` }, { quoted: msg })
        return
      }

      const speciesId = (args[1] ?? '').toLowerCase()
      const name      = args.slice(speciesId ? 2 : 1).join(' ').trim() || 'Compañero'

      let species
      if (speciesId && PetManager.getSpecies(speciesId)) {
        species = PetManager.getSpecies(speciesId)!
      } else {
        species = PetManager.randomSpecies()
      }

      const pet = PetManager.create(species, name)
      patchUserData(sender, { money: user.money - cost, petFull: pet })

      await sock.sendMessage(jid, {
        text: [
          `🐾 *¡Nueva mascota adoptada!*`,
          '',
          `${species.emoji} *${name}* — ${species.name}`,
          `${RARITY_EMOJI[species.rarity]} ${species.rarity.toUpperCase()}`,
          `_${species.desc}_`,
          '',
          `⚔️ ATK: ${species.baseAtk}  🛡️ DEF: ${species.baseDef}  ❤️ HP: ${species.baseHp}`,
          species.evolvesAt ? `✨ Evoluciona al nivel ${species.evolvesAt[0]}` : '',
        ].filter(Boolean).join('\n'),
      }, { quoted: msg })
      return
    }

    // ── Ver estado ────────────────────────────────────────────────────────────
    if (!sub || sub === 'ver' || sub === 'status' || sub === 'estado') {
      const target   = mentioned[0] ?? sender
      const targetUser = getUserData(target)
      const pet = targetUser.petFull

      if (!pet) {
        const who = target === sender ? '_No tienes mascota._' : `_${targetUser.name} no tiene mascota._`
        await sock.sendMessage(jid, {
          text: `${who}\n_Usa !mascota adoptar para conseguir una. Costo: 500 💰_`,
        }, { quoted: msg })
        return
      }

      PetManager.decayStats(pet)
      patchUserData(target, { petFull: pet })

      await sock.sendMessage(jid, { text: PetManager.formatStatus(pet) }, { quoted: msg })
      return
    }

    // ── Alimentar ─────────────────────────────────────────────────────────────
    if (sub === 'alimentar' || sub === 'comer' || sub === 'feed') {
      const pet = getPet(sender)
      if (!pet) { await sock.sendMessage(jid, { text: `_No tienes mascota._` }, { quoted: msg }); return }
      PetManager.decayStats(pet)
      const msg2 = PetManager.feed(pet)
      const { leveled, evolved } = PetManager.addExp(pet, 5)
      patchUserData(sender, { petFull: pet })

      let text = msg2
      if (leveled)  text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
      if (evolved)  text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
      await sock.sendMessage(jid, { text }, { quoted: msg })
      return
    }

    // ── Jugar ─────────────────────────────────────────────────────────────────
    if (sub === 'jugar' || sub === 'play') {
      const pet = getPet(sender)
      if (!pet) { await sock.sendMessage(jid, { text: `_No tienes mascota._` }, { quoted: msg }); return }
      PetManager.decayStats(pet)
      const msg2 = PetManager.play(pet)
      const { leveled, evolved } = PetManager.addExp(pet, 8)
      patchUserData(sender, { petFull: pet })

      let text = msg2
      if (leveled) text += `\n⬆️ *¡${pet.name} subió al nivel ${pet.level}!*`
      if (evolved) text += `\n✨ *¡${pet.name} evolucionó a ${evolved.name}!* ${evolved.emoji}`
      await sock.sendMessage(jid, { text }, { quoted: msg })
      return
    }

    // ── Dormir ────────────────────────────────────────────────────────────────
    if (sub === 'dormir' || sub === 'sleep') {
      const pet = getPet(sender)
      if (!pet) { await sock.sendMessage(jid, { text: `_No tienes mascota._` }, { quoted: msg }); return }
      PetManager.decayStats(pet)
      await sock.sendMessage(jid, { text: PetManager.sleep(pet) }, { quoted: msg })
      patchUserData(sender, { petFull: pet })
      return
    }

    // ── Liberar ───────────────────────────────────────────────────────────────
    if (sub === 'liberar' || sub === 'release' || sub === 'soltar') {
      if (!getPet(sender)) {
        await sock.sendMessage(jid, { text: `_No tienes mascota._` }, { quoted: msg })
        return
      }
      const stored = getUserData(sender)
      delete (stored as any).petFull
      await sock.sendMessage(jid, { text: `_Tu mascota fue liberada._` }, { quoted: msg })
      return
    }

    // ── Batalla ───────────────────────────────────────────────────────────────
    if (sub === 'batalla' || sub === 'battle' || sub === 'pelear') {
      const target = mentioned[0]
      if (!target) {
        await sock.sendMessage(jid, { text: `_Uso: !mascota batalla @usuario_` }, { quoted: msg })
        return
      }
      const myPet     = getPet(sender)
      const theirPet  = getPet(target)
      if (!myPet || !theirPet) {
        await sock.sendMessage(jid, {
          text: `❌ ${!myPet ? 'Tú no tienes' : `@${target.split('@')[0]} no tiene`} mascota.`,
          mentions: !myPet ? [] : [target],
        }, { quoted: msg })
        return
      }

      const state = PetManager.startBattle(sender, target, myPet, theirPet)
      const lines = [
        `⚔️ *BATALLA DE MASCOTAS*`,
        `@${sender.split('@')[0]} (${myPet.name}) vs @${target.split('@')[0]} (${theirPet.name})`,
        '',
      ]

      // Auto-resolve 10 rounds max
      for (let i = 0; i < 10; i++) {
        const r = PetManager.autoRound(state)
        lines.push(`R${i + 1}: ${r.log}`)
        if (r.over) {
          const winJid = r.winner!
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
          await sock.sendMessage(jid, {
            text: lines.join('\n'),
            mentions: [sender, target],
          }, { quoted: msg })
          return
        }
      }

      patchUserData(sender, { petFull: myPet })
      patchUserData(target,  { petFull: theirPet })
      lines.push('', `⚖️ *¡Empate!*`)
      await sock.sendMessage(jid, { text: lines.join('\n'), mentions: [sender, target] }, { quoted: msg })
      return
    }

    // ── Catálogo de especies ──────────────────────────────────────────────────
    if (sub === 'catalogo' || sub === 'especies' || sub === 'lista') {
      const filterRarity = (args[1] ?? '') as PetRarity
      const filtered: PetSpecies[] = filterRarity
        ? PET_SPECIES.filter(s => s.rarity === filterRarity)
        : [...PET_SPECIES]

      const by: Record<string, PetSpecies[]> = {}
      for (const s of filtered) {
        if (!by[s.rarity]) by[s.rarity] = []
        by[s.rarity]!.push(s)
      }

      const lines = ['*🐾 CATÁLOGO DE MASCOTAS*', '']
      for (const [rarity, list] of Object.entries(by)) {
        lines.push(`${RARITY_EMOJI[rarity as PetRarity]} *${rarity.toUpperCase()}*`)
        for (const s of list) {
          const evo = s.evolvesAt ? ` → evoluciona en lv.${s.evolvesAt[0]}` : ''
          lines.push(`  ${s.emoji} \`${s.id}\` ${s.name}${evo}`)
        }
        lines.push('')
      }
      lines.push(`_!mascota adoptar <id> <nombre>_`)
      await sock.sendMessage(jid, { text: lines.join('\n').trimEnd() }, { quoted: msg })
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*🐾 SISTEMA DE MASCOTAS AVANZADO*

> !mascota — Ver estado de tu mascota
> !mascota adoptar [id] <nombre> — Adoptar (500 💰)
> !mascota alimentar — Darle de comer
> !mascota jugar — Jugar con tu mascota
> !mascota dormir — Hacer dormir a tu mascota
> !mascota batalla @user — Batalla contra mascota ajena
> !mascota catalogo — Ver todas las especies
> !mascota liberar — Soltar tu mascota

_Las mascotas evolucionan al alcanzar ciertos niveles._
_Cuídalas bien: si no las alimentas pierden stats._`,
    }, { quoted: msg })
  },
}

export default command
