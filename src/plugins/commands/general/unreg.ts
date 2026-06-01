import type { Command } from '../../../types/index.js'
import { getUserData, setUserData, defaultUserData } from '@core/events.js'
import { createHash } from 'crypto'

const command: Command = {
  name: 'unreg',
  aliases: ['unregister', 'desregistrar'],
  description: 'Cancela tu registro — requiere numero de serie',
  category: 'general',
  register: true,
  cooldown: 5,

  async execute({ sock, jid, msg, args, sender, pushName, prefix }) {
    const user = getUserData(sender, pushName)

    // no registrado
    if (!user.registered) {
      await sock.sendMessage(jid, {
        text: `✗ No estas registrado.\n  Usa: ${prefix}reg nombre.edad`,
      }, { quoted: msg })
      return
    }

    // numero de serie unico del usuario
    const serial = createHash('md5').update(sender).digest('hex').slice(0, 6).toUpperCase()

    // sin argumento — pedir numero de serie
    if (!args[0]) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Ingresa tu numero de serie.`,
          ``,
          `  Uso: ${prefix}unreg <serie>`,
          `  Para ver tu serie usa: ${prefix}perfil`,
          ``,
          `  § Tu serie se muestra al registrarte.`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // verificar numero de serie
    if (args[0].toUpperCase() !== serial) {
      await sock.sendMessage(jid, {
        text: [
          `✗ Numero de serie incorrecto.`,
          ``,
          `  § Verifica tu serie con: ${prefix}perfil`,
          `  § Ingresa exactamente como aparece.`,
        ].join('\n'),
      }, { quoted: msg })
      return
    }

    // resetear datos manteniendo exp, money y diamonds
    setUserData(sender, {
      ...defaultUserData(pushName),
      exp:      user.exp,
      money:    user.money,
      diamonds: user.diamonds,
      warns:    user.warns,
    })

    await sock.sendMessage(jid, {
      text: [
        `┌────────────────────`,
        `│  ◆ DESREGISTRADO`,
        `└────────────────────`,
        ``,
        ` § Ya no estas registrado.`,
        ` § Tu exp, monedas y diamantes`,
        `   fueron conservados.`,
        ``,
        `> Volver a registrarse:`,
        `> ${prefix}reg nombre.edad`,
      ].join('\n'),
    }, { quoted: msg })
  },
}

export default command