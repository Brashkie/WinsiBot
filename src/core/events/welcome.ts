import type { WASocket } from '@whiskeysockets/baileys'
import { getGroupConfig } from './index.js'
import { handleCaptchaJoin } from './captcha.js'

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
        const text = config.sWelcome
          ? config.sWelcome.replace('@user', `@${num}`)
          : `Bienvenido @${num}!`
        await sock.sendMessage(id, { text, mentions: [participant] }).catch(() => {})
        break
      }
      case 'remove': {
        if (!config.welcome) break
        const text = config.sBye
          ? config.sBye.replace('@user', `@${num}`)
          : `Adios @${num}!`
        await sock.sendMessage(id, { text, mentions: [participant] }).catch(() => {})
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

export async function handleGroupsUpdate(
  sock:    WASocket,
  updates: any[],
): Promise<void> {
  for (const update of updates) {
    const { id } = update
    if (!id) continue
    const config = getGroupConfig(id)
    if (!config.detect) continue

    if (update.subject) {
      await sock.sendMessage(id, {
        text: `◈ Nombre actualizado: *${update.subject}*`,
      }).catch(() => {})
    }
    if (update.desc) {
      await sock.sendMessage(id, {
        text: `◈ Descripcion actualizada:\n${update.desc}`,
      }).catch(() => {})
    }
  }
}