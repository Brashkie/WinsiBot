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
  m => `Clonaste la tarjeta de acceso del edificio de oficinas y vendiste copias a los que llegaban tarde. Ganaste *¥${m}*`,
  m => `Montaste un "cajero automático" falso en la esquina por dos horas antes de que alguien sospechara. Recogiste *¥${m}*`,
  m => `Le vendiste entradas VIP falsas a un concierto que ni siquiera existía. El grupo de WhatsApp lo creyó todo. Ganaste *¥${m}*`,
  m => `Desviaste un envío de encomiendas a tu dirección "por error". Adentro había algo que se vendió rápido: *¥${m}*`,
  m => `Te hiciste pasar por inspector de sanidad y "multaste" a tres puestos del mercado. Pagaron para que te fueras: *¥${m}*`,
  m => `Encontraste la contraseña del wifi de un vecino pegada en la puerta y le vendiste el acceso a medio edificio. Ganaste *¥${m}*`,
  m => `Organizaste una "colecta solidaria" que nunca llegó a ningún lado. El grupo del barrio donó *¥${m}*`,
  m => `Le cambiaste la etiqueta de precio a un producto caro en la tienda. El cajero ni lo notó. Ahorraste y revendiste: *¥${m}*`,
  m => `Convenciste a la aseguradora de que el celular "se cayó al río" cuando en realidad lo vendiste. Cobraste *¥${m}*`,
  m => `Falsificaste un currículum tan bueno que hasta a ti te sorprendió que funcionara. Cobraste el primer sueldo: *¥${m}*`,
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
  (l, x) => `El "cajero falso" que armaste se cayó a mitad de estafa frente a todo el mundo. Perdiste *¥${l}* y *${x} XP* de dignidad`,
  (l, x) => `La tarjeta de acceso clonada activó la alarma en vez de abrir la puerta. Perdiste *¥${l}* y *${x} XP* corriendo`,
  (l, x) => `Uno de los que compró la entrada falsa resultó ser el hermano del organizador real. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `El inspector de sanidad de verdad llegó justo cuando estabas "inspeccionando". Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `El vecino cambió la contraseña del wifi antes de que cobraras la última cuota. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `La aseguradora mandó a alguien a "verificar" el río. No encontraron el celular, sí encontraron tu mentira. Perdiste *¥${l}* y *${x} XP*`,
  (l, x) => `Alguien reconoció el currículum falso porque era literalmente el suyo. Perdiste *¥${l}* y *${x} XP*`,
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
      // BrasEmbers — moneda rara para comandos NSFW, chance chica (solo en éxito)
      const embers    = Math.random() < 0.04 ? 1 : 0
      const emberLine = embers > 0 ? `\n> +${embers} BrasEmbers (¡raro!)` : ''

      if (choice === 0) {
        patchUserData(sender, { exp: user.exp + exp, embers: user.embers + embers })
        const lvlLine = levelUpLine(checkLevelUp(sender), jid)
        await sock.sendMessage(jid, {
          text: `> ${story(exp)}\n> +${exp} XP${lvlLine}${emberLine}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      } else if (choice === 1) {
        patchUserData(sender, { diamonds: user.diamonds + diamonds, money: user.money + money, embers: user.embers + embers })
        await sock.sendMessage(jid, {
          text: `> ${story(money)}\n> +${diamonds} 💎  ·  +¥${money.toLocaleString()}${emberLine}\n\n_Próximo en 1h_`,
        }, { quoted: msg })
      } else {
        patchUserData(sender, { money: user.money + money, embers: user.embers + embers })
        await sock.sendMessage(jid, {
          text: `> ${story(money)}${emberLine}\n\n_Próximo en 1h_`,
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
