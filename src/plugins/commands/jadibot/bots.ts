import type { Command } from '../../../types/index.js'
import { subBots } from './serbot.js'
import { getUserData, TIER_LABELS, type UserTier } from '@core/events/index.js'
import { safeSend } from '@lib/media_sender.js'
import { config } from '@config'

type Category = 'principal' | UserTier

const CATEGORY_ORDER: Category[] = ['principal', 'vip', 'premium', 'pro', 'promax', 'free']

const CATEGORY_LABELS: Record<Category, string> = {
  principal: 'Principal',
  ...TIER_LABELS,
}

const CATEGORY_ICONS: Record<Category, string> = {
  principal: '❖',
  vip:       '✦',
  premium:   '☆',
  pro:       '✪',
  promax:    '✧',
  free:      '·',
}

// Bots del propio owner del bot (config.ownerJid) son "Principal", no un
// tier — el resto se categoriza por el tier (#settier) de quien lo activó.
function categoryOf(ownerJid: string): Category {
  if (config.ownerJid.includes(ownerJid)) return 'principal'
  return getUserData(ownerJid).tier ?? 'free'
}

const command: Command = {
  name:        'bots',
  aliases:     ['botsactivos', 'statsbots'],
  description: 'Resumen de sub-bots activos por categoría',
  category:    'jadibot',

  async execute({ sock, jid, msg }) {
    const connected = [...subBots.values()].filter(b => b.status === 'connected')

    const counts: Record<Category, number> = {
      principal: 0, vip: 0, premium: 0, pro: 0, promax: 0, free: 0,
    }
    for (const bot of connected) counts[categoryOf(bot.ownerJid)]++

    const summaryLines = CATEGORY_ORDER.map(
      cat => `${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat]} » ${counts[cat]} sesión(es)`,
    )

    const here = connected.filter(b => b.chatJid === jid)

    const text = [
      `「✦」Lista de bots activos (${connected.length} sesiones)`,
      ``,
      ...summaryLines,
      ``,
      `▭ En este grupo: ${here.length}`,
      ...(here.length
        ? here.map(b => ` · [${CATEGORY_LABELS[categoryOf(b.ownerJid)]} ${b.name}] » @${b.ownerJid.replace(/[^0-9]/g, '')}`)
        : [' · Ninguno']),
    ].join('\n')

    await safeSend(() => sock.sendMessage(jid, {
      text,
      mentions: here.map(b => b.ownerJid),
    }, { quoted: msg }))
  },
}

export default command
