import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData } from '@core/events.js'
import { Avatar, AvatarManager, type AvatarInventory } from '@lib/avatar.js'

const command: Command = {
  name: 'avatar',
  aliases: ['av', 'minavatar'],
  description: 'Crea, equipa y muestra tu avatar RPG',
  category: 'rpg',
  cooldown: 5,

  async execute({ sock, jid, msg, args, sender, pushName }) {
    const user = getUserData(sender, pushName)
    const inv: AvatarInventory = user.avatar ?? { unlocked: [], avatars: [] }

    const sub = (args[0] ?? '').toLowerCase()

    // ── !avatar crear ─────────────────────────────────────────────────────────
    if (!sub || sub === 'crear' || sub === 'new') {
      const MAX_AVATARS = user.premium ? 10 : 3
      if (inv.avatars.length >= MAX_AVATARS) {
        await sock.sendMessage(jid, {
          text: `❌ Tienes el máximo de *${MAX_AVATARS}* avatares${user.premium ? '' : ' (Premium tiene hasta 10)'}.\nUsa *!avatar lista* para ver los tuyos.`,
        }, { quoted: msg })
        return
      }

      const { avatar, inv: updated } = AvatarManager.create(inv)
      patchUserData(sender, { avatar: updated })

      const av    = new Avatar(avatar)
      const label = AvatarManager.rarityLabel(avatar.rarity)
      await sock.sendMessage(jid, {
        text: `*¡NUEVO AVATAR!* ${label}\n\n${av.toString()}\n\n_Usa !avatar lista para ver todos tus avatares_`,
      }, { quoted: msg })
      return
    }

    // ── !avatar ver / mostrar ─────────────────────────────────────────────────
    if (sub === 'ver' || sub === 'mostrar' || sub === 'show') {
      if (!inv.current) {
        await sock.sendMessage(jid, {
          text: `_No tienes avatar equipado. Usa !avatar crear para conseguir uno._`,
        }, { quoted: msg })
        return
      }
      const av = new Avatar(inv.current)
      await sock.sendMessage(jid, {
        text: `*AVATAR DE @${sender.split('@')[0]}*\n\n${av.toString()}`,
        mentions: [sender],
      }, { quoted: msg })
      return
    }

    // ── !avatar lista ─────────────────────────────────────────────────────────
    if (sub === 'lista' || sub === 'galeria' || sub === 'galería' || sub === 'gallery') {
      const gallery = AvatarManager.gallery(inv)
      await sock.sendMessage(jid, {
        text: `*TUS AVATARES* (${inv.avatars.length})\n\n${gallery}\n\n_!avatar equipar <número>_`,
      }, { quoted: msg })
      return
    }

    // ── !avatar equipar <N> ───────────────────────────────────────────────────
    if (sub === 'equipar' || sub === 'equip' || sub === 'usar') {
      const idx = parseInt(args[1] ?? '') - 1
      if (isNaN(idx)) {
        await sock.sendMessage(jid, {
          text: `_Uso: !avatar equipar <número>\nEjemplo: !avatar equipar 2_`,
        }, { quoted: msg })
        return
      }
      try {
        const updated = AvatarManager.equip(inv, idx)
        patchUserData(sender, { avatar: updated })
        const av = new Avatar(updated.current!)
        await sock.sendMessage(jid, {
          text: `✅ *Avatar equipado*\n\n${av.toString()}`,
        }, { quoted: msg })
      } catch (err: any) {
        await sock.sendMessage(jid, { text: `❌ ${err?.message}` }, { quoted: msg })
      }
      return
    }

    // ── Ayuda ─────────────────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      text: `*SISTEMA DE AVATARES* 🎭

> !avatar crear — Genera un avatar aleatorio
> !avatar ver — Muestra tu avatar actual
> !avatar lista — Ve todos tus avatares
> !avatar equipar <N> — Equipa el avatar número N

_Raridades: ⚪ Común · 🔵 Raro · 🟣 Épico · 🌟 Legendario_
_Tienes ${inv.avatars.length}/${user.premium ? 10 : 3} avatares_`,
    }, { quoted: msg })
  },
}

export default command
