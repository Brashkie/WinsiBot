import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'
import { handleCaptchaJoin } from './captcha.js'
import { getGroupMetadata } from '@core/groupCache.js'
import { sendWithMedia } from '@lib/media_sender.js'
import { config as botConfig } from '@config'

const GITHUB_URL           = 'https://github.com/Brashkie/WinsiBot'
const DEFAULT_WELCOME_BODY = 'Respeta las reglas, sé amable y diviértete'
const DEFAULT_BYE_BODY     = 'Que te vaya bien'

function footerLines(): string[] {
  const prefix = botConfig.prefix[0] ?? '#'
  return [
    `│`,
    `│ § Usa ${prefix}help para ver los comandos`,
    `│ § ${GITHUB_URL}`,
  ]
}

export async function handleParticipantsUpdate(
  sock:   WASocket,
  update: { id: string; participants: string[]; action: string },
): Promise<void> {
  const { id, participants, action } = update
  const config = getGroupConfig(id)

  for (const participant of participants) {
    const num = participant.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')

    switch (action) {
      case 'add': {
        if (config.captcha) {
          await handleCaptchaJoin(sock, id, participant)
          break
        }
        if (!config.welcome) break

        let caption: string
        if (config.sWelcome) {
          caption = config.sWelcome.replace('@user', `@${num}`)
        } else {
          const metadata  = await getGroupMetadata(sock, id)
          const groupName = metadata?.subject ?? 'el grupo'
          const body      = metadata?.desc?.trim() || DEFAULT_WELCOME_BODY
          caption = [
            `╭─「 ◈ Bienvenid@ 」`,
            `│ ◆ *${groupName}*`,
            `│ § @${num}`,
            `│`,
            // body puede ser la descripción del grupo (multilínea) — cada
            // línea necesita su propio `>` al principio, WhatsApp no
            // continúa el bloque de cita si alguna línea no lo tiene.
            ...body.split('\n').map(line => `> ${line}`),
            ...footerLines(),
            `╰─ WinsiBot`,
          ].join('\n')
        }
        await sendWithMedia(sock, id, caption, 'WinsiBot', undefined, false, [participant]).catch(() => {})
        break
      }
      case 'remove': {
        if (!config.welcome) break

        let caption: string
        if (config.sBye) {
          caption = config.sBye.replace('@user', `@${num}`)
        } else {
          const metadata  = await getGroupMetadata(sock, id)
          const groupName = metadata?.subject ?? 'el grupo'
          caption = [
            `╭─「 ◈ Hasta luego 」`,
            `│ ◆ *${groupName}*`,
            `│ § @${num}`,
            `│`,
            `> ${DEFAULT_BYE_BODY}`,
            ...footerLines(),
            `╰─ WinsiBot`,
          ].join('\n')
        }
        await sendWithMedia(sock, id, caption, 'WinsiBot', undefined, false, [participant]).catch(() => {})
        break
      }
      case 'promote': {
        if (!config.detect) break
        const text = config.sPromote
          ? config.sPromote.replace('@user', `@${num}`)
          : `@${num} ahora es administrador`
        await sock.sendMessage(id, { text, mentions: [participant] }).catch(() => {})
        break
      }
      case 'demote': {
        if (!config.detect) break
        const text = config.sDemote
          ? config.sDemote.replace('@user', `@${num}`)
          : `@${num} ya no es administrador`
        await sock.sendMessage(id, { text, mentions: [participant] }).catch(() => {})
        break
      }
    }
  }
}

// WhatsApp/Baileys emite 'groups.update' con el subject/desc ACTUAL de todos
// los grupos cada vez que hace un resync masivo (señal interna 'dirty', no
// necesariamente un cambio real) — no solo cuando algo cambió de verdad. Sin
// comparar contra el último valor conocido, eso spamea el aviso de "Nombre
// actualizado" en cada grupo con `detect` activo en cada resync. Se guarda el
// último subject/desc visto por grupo y solo se avisa si realmente cambió.
const lastKnown = new Map<string, { subject?: string; desc?: string }>()

export async function handleGroupsUpdate(
  sock:    WASocket,
  updates: any[],
): Promise<void> {
  for (const update of updates) {
    const { id } = update
    if (!id) continue

    const prev = lastKnown.get(id)
    const seenBefore = !!prev
    lastKnown.set(id, { subject: update.subject ?? prev?.subject, desc: update.desc ?? prev?.desc })

    // Primera vez que vemos este grupo (recién arrancó el bot) — solo
    // registrar el estado, no avisar (si no, spamea "cambió" en el arranque).
    if (!seenBefore) continue

    const config = getGroupConfig(id)
    if (!config.detect) continue

    if (update.subject && update.subject !== prev?.subject) {
      await sock.sendMessage(id, {
        text: `◈ Nombre actualizado: *${update.subject}*`,
      }).catch(() => {})
    }
    if (update.desc && update.desc !== prev?.desc) {
      await sock.sendMessage(id, {
        text: `◈ Descripcion actualizada:\n${update.desc}`,
      }).catch(() => {})
    }
  }
}