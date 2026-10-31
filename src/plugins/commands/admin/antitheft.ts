import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { destinoDe } from '@lib/targets.js'
import { getGroupConfig, setGroupConfig } from '@core/events/index.js'
import { getGroupMetadata } from '@core/groupCache.js'
import { esGuardian, protegidosDe } from '@core/events/antitheft.js'
import { MAX_PROTEGIDOS, aliasDe, esLaMisma, type Participante } from '@lib/groupGuard.js'

const command: Command = {
  name:        'antirrobo',
  aliases:     ['antitheft', 'antirobo'],
  description: 'Protege a los admins del grupo de que se lo roben  |  !antirrobo on  ·  off  ·  proteger @usuario  ·  quitar @usuario',
  category:    'admin',
  groupOnly:   true,

  async execute({ sock, jid, msg, args, sender, isOwner, isBotAdmin, prefix }) {
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // Solo un protegido lo toca: si cualquier admin pudiera apagarlo, el
    // atacante lo apagaría antes de robar.
    if (!(await esGuardian(sock, jid, sender, isOwner))) {
      await responder('§ Solo el creador del grupo, los dueños del bot o un admin protegido pueden usar el antirrobo')
      return
    }

    const cfg = getGroupConfig(jid)
    const meta = await getGroupMetadata(sock, jid)
    const participantes = (meta?.participants ?? []) as Participante[]
    const sub = args[0]?.toLowerCase()

    if (sub === 'on' || sub === 'activar' || sub === 'enable') {
      // Quien lo activa queda protegido, con todos sus alias.
      const yo = aliasDe(sender, participantes)
      const ya = cfg.protegidos.some((p) => esLaMisma(p, sender, participantes))
      setGroupConfig(jid, { antirrobo: true, protegidos: ya ? cfg.protegidos : [...cfg.protegidos, ...yo] })
      await responder(
        isBotAdmin
          ? '🛡 Antirrobo *activado*. Si alguien no protegido degrada o saca a un protegido, le quito el admin, lo revierto, revoco el enlace y aviso por privado'
          : '🛡 Antirrobo *activado*, pero no soy admin: solo podré avisar. Dame admin para que pueda revertir un robo',
      )
      return
    }
    if (sub === 'off' || sub === 'desactivar' || sub === 'disable') {
      setGroupConfig(jid, { antirrobo: false })
      await responder('🛡 Antirrobo *desactivado*')
      return
    }
    if (sub === 'proteger' || sub === 'quitar') {
      const target = destinoDe(msg, args.slice(1))
      if (!target) { await responder(`§ Menciona o cita a quien: ${prefix}antirrobo ${sub} @usuario`); return }
      const resto = cfg.protegidos.filter((p) => !esLaMisma(p, target, participantes))
      if (sub === 'quitar') {
        setGroupConfig(jid, { protegidos: resto })
        await responder(`§ @${target.split('@')[0]} ya no está protegido`, [target])
        return
      }
      // Una persona, no un alias: la misma con su número y su @lid cuenta una vez.
      const personas = new Set(resto.map((p) => aliasDe(p, participantes).sort()[0]))
      if (personas.size >= MAX_PROTEGIDOS) { await responder(`§ Ya hay ${MAX_PROTEGIDOS} protegidos: quita a alguien primero`); return }
      setGroupConfig(jid, { protegidos: [...resto, ...aliasDe(target, participantes)] })
      await responder(`🛡 @${target.split('@')[0]} ahora está protegido`, [target])
      return
    }

    const lista = protegidosDe(cfg, meta?.owner)
      .map((p) => aliasDe(p, participantes).find((a) => a.endsWith('@s.whatsapp.net')) ?? p)
    const unicos = [...new Set(lista)]
    await responder(
      [
        `🛡 *Antirrobo*: ${cfg.antirrobo ? '✔ activado' : '✗ desactivado'}${isBotAdmin ? '' : ' (no soy admin: solo aviso)'}`,
        ``,
        `Protegidos (el creador, los dueños del bot y los marcados):`,
        ...unicos.map((p) => `§ @${p.split('@')[0]}`),
        ``,
        `✎ ${prefix}antirrobo on · off`,
        `✎ ${prefix}antirrobo proteger @usuario`,
        `✎ ${prefix}antirrobo quitar @usuario`,
      ].join('\n'),
      unicos,
    )
  },
}

export default command
