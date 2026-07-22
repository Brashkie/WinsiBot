import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const CD = 3 * 60 * 60_000 // 3h — fuente principal y más confiable de BrasEmbers

const WIN: Array<(n: number) => string> = [
  n => `Removiste las cenizas de una fogata abandonada hace días y todavía quedaban *${n}* brasas encendidas en el fondo.`,
  n => `Un forjador retirado te dejó hurgar en su horno apagado a cambio de ayuda cargando leña. Encontraste *${n}* brasas vivas.`,
  n => `Seguiste el rastro de humo hasta un campamento vacío. El fuego ya casi se apagaba, pero rescataste *${n}* brasas.`,
  n => `En las ruinas de una antigua herrería, entre el hollín, brillaban *${n}* brasas que nunca terminaron de enfriarse.`,
  n => `Le tuviste paciencia al último tronco de la noche. Cuando se deshizo, quedaron *${n}* brasas para vos.`,
]

const LOSE = [
  'Removiste las cenizas con cuidado, pero el fuego ya se había apagado del todo hace rato. Nada.',
  'Encontraste una fogata... con alguien más ya revolviéndola. Te fuiste con las manos vacías.',
  'El viento apagó las últimas brasas justo antes de que llegaras. Mala suerte.',
  'Te quemaste un dedo por apurarte y soltaste todo. La próxima con más cuidado.',
  'Solo quedaba ceniza fría. Alguien se te adelantó por poco.',
]

const command: Command = {
  name:        'ascuas',
  aliases:     ['embers', 'brasas', 'buscarbrasas'],
  description: 'Busca BrasEmbers entre restos de fogatas — cooldown largo, no siempre encontrás algo',
  category:    'rpg',
  cooldown:    0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastAscuas', CD)) {
      const left = getCooldownLeft(sender, 'lastAscuas', CD)
      await sock.sendMessage(jid, {
        text: `> Todavía no se prendió otra fogata cerca. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const success = Math.random() < (isPrem ? 0.6 : 0.5)

    setCooldown(sender, 'lastAscuas')

    if (!success) {
      await sock.sendMessage(jid, {
        text: `> ${pick(LOSE)}\n\n_Próximo intento en 3h_`,
      }, { quoted: msg })
      return
    }

    const embers = isPrem ? rand(2, 3) : rand(1, 2)
    patchUserData(sender, { embers: user.embers + embers })

    await sock.sendMessage(jid, {
      text: `> ${pick(WIN)(embers)}\n> +${embers} BrasEmbers\n\n_Próximo intento en 3h_`,
    }, { quoted: msg })
  },
}

export default command
