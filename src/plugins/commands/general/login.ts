import type { Command } from '../../../types/index.js'
import { confirmLogin } from '@dashboard/auth.js'
import { getNumber } from '@lib/jid_utils.js'

const command: Command = {
  name:        'login',
  aliases:     ['weblogin'],
  description: 'Vincula tu sesión del panel web — escribí el código que te mostró la web',
  category:    'general',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender }) {
    const code = args.join(' ').trim()

    if (!code) {
      await sock.sendMessage(jid, {
        text: `§ Uso: *#login <código>*\n§ El código lo ves en la web al elegir "Continuar con WhatsApp"`,
      }, { quoted: msg })
      return
    }

    const senderPhone = getNumber(sender)
    const ok = confirmLogin(code, sender, senderPhone)

    await sock.sendMessage(jid, {
      text: ok
        ? `✔ Sesión iniciada — ya podés volver a la web`
        : `✗ Código inválido, vencido, o no coincide con tu número`,
    }, { quoted: msg })
  },
}

export default command
