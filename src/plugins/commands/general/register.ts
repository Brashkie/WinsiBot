import type { Command } from '../../../types/index.js'
import { getUserData, setUserData } from '@core/events.js'
import { createHash } from 'crypto'

const REG_REGEX = /^(.+)[.|,]\s*(\d+)$/i

const command: Command = {
  name: 'registro',
  aliases: ['reg', 'register', 'registrar', 'verify', 'verificar'],
  description: 'Registrate en el bot',
  category: 'general',
  cooldown: 5,

  async execute({ sock, jid, msg, args, sender, pushName, prefix }) {
    const user = getUserData(sender, pushName)

    // ya registrado
    if (user.registered) {
      await sock.sendMessage(jid, {
        text: `§ Ya estas registrado.\n  Para desregistrarte usa: ${prefix}unreg`,
      }, { quoted: msg })
      return
    }

    const text = args.join(' ').trim()

    // formato incorrecto
    if (!text || !REG_REGEX.test(text)) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Formato incorrecto.`,
          ``,
          `  Uso: ${prefix}reg nombre.edad`,
          `  Ejemplo: ${prefix}reg ${pushName || 'Juan'}.21`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    const match = text.match(REG_REGEX)
    const name  = match?.[1]?.trim() ?? ''
    const age   = parseInt(match?.[2] ?? '0')

    // validaciones
    if (!name) {
      await sock.sendMessage(jid, {
        text: '✗ El nombre es obligatorio.',
      }, { quoted: msg })
      return
    }

    if (name.length > 30) {
      await sock.sendMessage(jid, {
        text: '✗ El nombre no puede tener mas de 30 caracteres.',
      }, { quoted: msg })
      return
    }

    if (isNaN(age) || age <= 0) {
      await sock.sendMessage(jid, {
        text: '✗ La edad es obligatoria.',
      }, { quoted: msg })
      return
    }

    if (age > 999) {
      await sock.sendMessage(jid, {
        text: '§ Viejo/a sabroso/a xd',
      }, { quoted: msg })
      return
    }

    if (age < 5) {
      await sock.sendMessage(jid, {
        text: '§ Ven, te adoptare!!',
      }, { quoted: msg })
      return
    }

    // registrar usuario
    const regTime = Date.now()
    const code    = createHash('md5').update(sender).digest('hex').slice(0, 6).toUpperCase()

    setUserData(sender, {
      name,
      registered: true,
      exp:        user.exp      + 150,
      money:      user.money    + 2100,
      diamonds:   user.diamonds + 7,
    })

    const text2 = [
      `┌───────────────────`,
      `│  ◆ REGISTRADO`,
      `└───────────────────`,
      ``,
      `  § Nombre  » ${name}`,
      `  § Edad    » ${age} años`,
      `  § Codigo  » ${code}`,
      ``,
      `╭═════════════════⊷`,
      ` 𒁈 Recompensas:`,
      `> `,
      `> 7 Diamantes ◆`,
      `> 2100 monedas`,
      `> 150 experiencia`,
      `╰═════════════════⊷`,
    ].join('\n')

    await sock.sendMessage(jid, {
      text: text2,
    }, { quoted: msg })
  },
}

export default command