import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const CD = 60 * 60_000

const WIN: Array<(m: number) => string> = [
  m => `Vendiste cromos de Steam que robaste de una cuenta olvidada. El comprador ni preguntó. Ganaste *¥${m}*`,
  m => `Hackeaste la wifi del vecino de arriba y lo usaste para minar crypto toda la noche. Ganaste *¥${m}* y él no sabe nada`,
  m => `Entraste al supermercado con cara de empleado y te fuiste con el cajón de las propinas. Nadie te detuvo: *¥${m}*`,
  m => `Vendiste "cursos de trading" en grupos de WhatsApp con screenshots de ganancias falsas. Tres incautos pagaron: *¥${m}*`,
  m => `Asaltaste un banco pero el guardia estaba dormido y el cajero en el break. Te fuiste sin problemas con *¥${m}*`,
  m => `Negociaste con la mafia local para distribuir productos "importados". Primera entrega exitosa: *¥${m}*`,
  m => `Le cobraste rescate a un empresario que te debía un favor. Pagó rápido y sin preguntas. Recibiste *¥${m}*`,
  m => `Pirateaste el Netflix de media ciudad y lo revendiste a ¥10 la cuenta. 300 suscriptores. Ganaste *¥${m}*`,
  m => `Robaste la identidad digital del admin del grupo y vendiste su número. Te pagaron *¥${m}*`,
  m => `Hackeaste un casino online explotando un bug que olvidaron parchear. Retiraste *¥${m}* antes de que lo notaran`,
  m => `Asaltaste el tren de la madrugada. Solo había un pasajero dormido con ¥${m} en efectivo. Los tomaste todos`,
  m => `Entraste al museo con ropa de guardia y saliste con una escultura bajo el saco. La vendiste por *¥${m}*`,
  m => `Organizaste una rifa falsa en el grupo del colegio. Nadie ganó. Tú te quedaste con *¥${m}*`,
  m => `Falsificaste tickets para un concierto y los vendiste todos. Los compradores lo descubrieron después de entrar. Ganaste *¥${m}*`,
  m => `Convenciste a tres personas de que eras cobrador del banco. Firmaron y pagaron. Total: *¥${m}*`,
]

const LOSE: Array<(loss: number, xp: number) => string> = [
  (l, x) => `La policía te siguió desde el banco y te agarró en la esquina. Te quitaron *¥${l}* y *${x} XP* de vergüenza`,
  (l, x) => `Tu cómplice te delató por una recompensa menor a lo que ibas a ganar. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `La alarma del local sonó a los 3 segundos de entrar. Corriste 6 cuadras pero igual te atraparon. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `Intentaste hackear una cuenta pero el dueño tenía autenticación de dos factores. Te rastrearon. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `El "empresario" que ibas a extorsionar resultó ser policía encubierto. Arrestado. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `Te confundiste de casa al entrar. Era la del jefe del barrio. Saliste corriendo pero te costó *¥${l}* y *${x} XP*`,
  (l, x) => `Vendiste cursos falsos pero uno de tus clientes era abogado. Te demandó en 24 horas. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `Intentaste asaltar la bodega del viejo Ramón. El viejo sacó una escoba y te persiguió 3 cuadras. Perdiste *¥${l}* y *${x} XP*`,
]

const command: Command = {
  name: 'crime',
  aliases: ['crimen', 'delito'],
  description: 'Comete un crimen — gana o pierde (1h cooldown)',
  category: 'rpg',
  cooldown: 0,
  groupOnly: true,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastCrime', CD)) {
      const left = getCooldownLeft(sender, 'lastCrime', CD)
      await sock.sendMessage(jid, {
        text: `> La policía está vigilando. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const success = Math.random() < (isPrem ? 0.65 : 0.5)

    setCooldown(sender, 'lastCrime')

    if (success) {
      const money    = rand(500, 8000)
      const exp      = rand(300, 3000)
      const diamonds = rand(5, 50)
      const choice   = Math.floor(Math.random() * 3)
      const story    = pick(WIN)

      if (choice === 0) {
        patchUserData(sender, { exp: user.exp + exp })
        const lvlLine = levelUpLine(checkLevelUp(sender))
        await sock.sendMessage(jid, {
          text: `> ${story(exp)}\n> +${exp} XP${lvlLine}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      } else if (choice === 1) {
        patchUserData(sender, { diamonds: user.diamonds + diamonds, money: user.money + money })
        await sock.sendMessage(jid, {
          text: `> ${story(money)}\n> +${diamonds} 💎  ·  +¥${money.toLocaleString()}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      } else {
        patchUserData(sender, { money: user.money + money })
        await sock.sendMessage(jid, {
          text: `> ${story(money)}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      }
    } else {
      const loss   = rand(100, Math.min(3000, Math.max(100, user.money)))
      const xpLoss = rand(50, 400)
      patchUserData(sender, {
        money: Math.max(0, user.money - loss),
        exp:   Math.max(0, user.exp - xpLoss),
      })
      await sock.sendMessage(jid, {
        text: `> ${pick(LOSE)(loss, xpLoss)}\n\n_Próximo en 1h_`,
      }, { quoted: msg })
    }
  },
}

export default command
