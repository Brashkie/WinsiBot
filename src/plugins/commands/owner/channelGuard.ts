import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getGroupConfig, groupConfigs, setGroupConfig } from '@core/events/index.js'
import { leerCanal } from '@lib/channelGuard.js'

const command: Command = {
  name:        'canal',
  aliases:     ['channelguard', 'protegercanal'],
  description: 'Protege el nombre y la descripción de un canal: si cambian, los restauro y te aviso  |  !canal proteger <link>  ·  actualizar <link>  ·  quitar <link>',
  category:    'owner',
  ownerOnly:   true,

  async execute({ sock, jid, msg, args, prefix }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const sub = args[0]?.toLowerCase()

    if (sub !== 'proteger' && sub !== 'actualizar' && sub !== 'quitar') {
      const protegidos = [...groupConfigs.entries()]
        .filter(([k, c]) => k.endsWith('@newsletter') && c.antirrobo && c.canal)
        .map(([k, c]) => `§ *${c.canal!.nombre}* — ${k}`)
      await responder([
        '🛡 *Canales protegidos*',
        ...(protegidos.length ? protegidos : ['§ Ninguno todavía']),
        '',
        'Si cambian el nombre o la descripción, los restauro y te aviso. WhatsApp no dice quién fue, así que no puedo sacarle el admin. Para restaurar tengo que ser admin del canal.',
        '',
        `✎ ${prefix}canal proteger <link o id del canal>`,
        `✎ ${prefix}canal actualizar <link o id> — guarda el nombre y la descripción de ahora`,
        `✎ ${prefix}canal quitar <link o id>`,
      ].join('\n'))
      return
    }

    const leido = leerCanal(args[1] ?? '')
    if (!leido) { await responder(`§ Pasa el link del canal (whatsapp.com/channel/…) o su id (…@newsletter)`); return }
    const meta = await ('jid' in leido
      ? sock.newsletterMetadata('jid', leido.jid)
      : sock.newsletterMetadata('invite', leido.codigo)
    ).catch(() => null)
    if (!meta?.id) { await responder('§ No encontré ese canal'); return }

    if (sub === 'quitar') {
      setGroupConfig(meta.id, { antirrobo: false })
      await responder(`🛡 *${meta.name}* ya no está protegido`)
      return
    }
    const ya = getGroupConfig(meta.id).canal
    setGroupConfig(meta.id, { antirrobo: true, canal: { nombre: meta.name, descripcion: meta.description ?? '' } })
    await responder(
      sub === 'actualizar' && ya
        ? `🛡 Guardé el nombre y la descripción de ahora de *${meta.name}*`
        : `🛡 *${meta.name}* protegido. Si cambian su nombre o su descripción, los restauro y te aviso`,
    )
  },
}

export default command
