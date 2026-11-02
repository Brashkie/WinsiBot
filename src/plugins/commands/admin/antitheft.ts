import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { destinoDe } from '@lib/targets.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index.js'
import { getGroupMetadata } from '@core/groupCache.js'
import { aliasDelBot, esGuardian, protegidosDe } from '@core/events/antitheft.js'
import { MAX_PROTEGIDOS, aliasDe, esLaMisma, type Participante } from '@lib/groupGuard.js'

const command: Command = {
  name:        'antirrobo',
  aliases:     ['antitheft', 'antirobo'],
  description: 'Protege a los admins del grupo —o de su comunidad— de que se lo roben  |  !antirrobo on  ·  off  ·  proteger @usuario  ·  quitar @usuario  ·  comunidad on',
  category:    'admin',
  groupOnly:   true,

  async execute({ sock, jid, msg, args, sender, isOwner, prefix }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // `#antirrobo comunidad …`: lo mismo, sobre la comunidad de este grupo. En
    // la comunidad no se puede escribir, así que se maneja desde uno de sus
    // grupos; el evento de sus admins llega con el jid de la comunidad, y ahí
    // es donde queda la configuración.
    let objetivo = jid
    let resto = args
    let que = 'el grupo'
    if (args[0]?.toLowerCase() === 'comunidad') {
      const padre = (await getGroupMetadata(sock, jid))?.linkedParent
      if (!padre) { await responder('§ Este grupo no es parte de una comunidad'); return }
      objetivo = padre
      resto = args.slice(1)
      que = 'la comunidad'
    }

    // Solo un protegido lo toca: si cualquier admin pudiera apagarlo, el
    // atacante lo apagaría antes de robar.
    if (!(await esGuardian(sock, objetivo, sender, isOwner))) {
      await responder(`§ Solo quien creó ${que}, los dueños del bot o un admin protegido pueden usar el antirrobo`)
      return
    }

    const cfg = getGroupConfig(objetivo)
    const meta = await getGroupMetadata(sock, objetivo)
    const participantes = (meta?.participants ?? []) as Participante[]
    const bot = aliasDelBot(sock)
    const botEsAdmin = !!meta?.participants.find((p) => bot.some((b) => esLaMisma(b, p.id, participantes)))?.admin
    const sub = resto[0]?.toLowerCase()
    const pre = objetivo === jid ? `${prefix}antirrobo` : `${prefix}antirrobo comunidad`

    if (sub === 'on' || sub === 'activar' || sub === 'enable') {
      // Quien lo activa queda protegido, con todos sus alias.
      const yo = aliasDe(sender, participantes)
      const ya = cfg.protegidos.some((p) => esLaMisma(p, sender, participantes))
      setGroupConfig(objetivo, { antirrobo: true, protegidos: ya ? cfg.protegidos : [...cfg.protegidos, ...yo] })
      await responder(
        botEsAdmin
          ? `🛡 Antirrobo *activado* en ${que}. Si alguien no protegido degrada o saca a un protegido, le quito el admin, lo revierto, revoco el enlace y aviso por privado`
          : `🛡 Antirrobo *activado* en ${que}, pero ahí no soy admin: solo podré avisar. Dame admin para que pueda revertir un robo`,
      )
      return
    }
    if (sub === 'off' || sub === 'desactivar' || sub === 'disable') {
      setGroupConfig(objetivo, { antirrobo: false })
      await responder(`🛡 Antirrobo *desactivado* en ${que}`)
      return
    }
    if (sub === 'proteger' || sub === 'quitar') {
      const target = destinoDe(msg, resto.slice(1))
      if (!target) { await responder(`§ Menciona o cita a quien: ${pre} ${sub} @usuario`); return }
      const otros = cfg.protegidos.filter((p) => !esLaMisma(p, target, participantes))
      if (sub === 'quitar') {
        setGroupConfig(objetivo, { protegidos: otros })
        await responder(`§ @${target.split('@')[0]} ya no está protegido en ${que}`, [target])
        return
      }
      // Una persona, no un alias: la misma con su número y su @lid cuenta una vez.
      const personas = new Set(otros.map((p) => aliasDe(p, participantes).sort()[0]))
      if (personas.size >= MAX_PROTEGIDOS) { await responder(`§ Ya hay ${MAX_PROTEGIDOS} protegidos: quita a alguien primero`); return }
      setGroupConfig(objetivo, { protegidos: [...otros, ...aliasDe(target, participantes)] })
      await responder(`🛡 @${target.split('@')[0]} ahora está protegido en ${que}`, [target])
      return
    }

    const lista = protegidosDe(cfg, meta?.owner)
      .map((p) => aliasDe(p, participantes).find((a) => a.endsWith('@s.whatsapp.net')) ?? p)
    const unicos = [...new Set(lista)]
    await responder(
      [
        `🛡 *Antirrobo de ${que}*: ${cfg.antirrobo ? '✔ activado' : '✗ desactivado'}${botEsAdmin ? '' : ' (no soy admin: solo aviso)'}`,
        ``,
        `Protegidos (quien lo creó, los dueños del bot y los marcados):`,
        ...unicos.map((p) => `§ @${p.split('@')[0]}`),
        ``,
        `✎ ${pre} on · off`,
        `✎ ${pre} proteger @usuario`,
        `✎ ${pre} quitar @usuario`,
        ...(objetivo === jid ? [`✎ ${prefix}antirrobo comunidad … — lo mismo, para la comunidad de este grupo`] : []),
      ].join('\n'),
      unicos,
    )
  },
}

export default command
