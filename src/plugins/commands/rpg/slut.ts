import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const CD = 60 * 60_000  // 1 hora

const SCENARIOS: Array<(m: number) => string> = [
  m => `Dejaste que un grupo de jóvenes te vistieran de puta a cambio de *¥${m}*`,
  m => `Bailaste en el privado de alguien que resultó ser muy generoso y dejó una propina enorme. Ganaste *¥${m}*`,
  m => `Te contrató una productora para "actuar" en contenido para adultos. Primera toma, una sola: *¥${m}*`,
  m => `Abriste un OnlyFans y tu primer suscriptor pagó la suscripción anual. Recibiste *¥${m}*`,
  m => `Te ofreciste a ser el entretenimiento de una despedida de soltero y todos contribuyeron. Ganaste *¥${m}*`,
  m => `Un político pagó discretamente para que no contaras lo que viste. Ni preguntes. Recibiste *¥${m}*`,
  m => `Hiciste un striptease en una fiesta privada y llovieron los billetes. Total de la noche: *¥${m}*`,
  m => `Te contrataron como acompañante VIP para una cena de negocios. La empresa pagó bien: *¥${m}*`,
  m => `Alguien pagó por ver tu feed de Instagram privado. El contenido era cuestionable pero el pago no: *¥${m}*`,
  m => `Fuiste a "hacer de modelo" para una sesión fotográfica artística de madrugada. Generosa compensación: *¥${m}*`,
  m => `El vecino adinerado te contrató para "mantenerte cerca". Vago en detalles, claro en el pago: *¥${m}*`,
  m => `Mandaste contenido exclusivo a un coleccionista anónimo. Rarísimo gusto, excelente pago: *¥${m}*`,
  m => `Actuaste en una obra de teatro adulto para mayores de 18. Sold out. Recibiste *¥${m}* por función`,
  m => `Una celebrity te contrató para guardar silencio. Firmaste NDA. Cobraste *¥${m}*`,
  m => `Fuiste la "distracción especial" en la reunión de socios de una empresa. Muy efectiva: *¥${m}*`,
  m => `Vendiste tu ropa usada en una plataforma fetichista. El envío fue lo más caro. Ganaste *¥${m}*`,
  m => `Hiciste una aparición especial en un video privado de alguien muy conocido. Cachés altos: *¥${m}*`,
  m => `Un grupo de ejecutivos aburridos pagó por tu compañía toda la noche. Aburridos pero generosos: *¥${m}*`,
  m => `Grabaste un ASMR "diferente" y los suscriptores de esa madrugada pagaron extra por la exclusividad. Ganaste *¥${m}*`,
  m => `Te invitaron a un yate privado a "conversar de negocios". Los negocios pagaron bien: *¥${m}*`,
  m => `Alguien pagó por una videollamada de "compañía" que duró toda la noche. Cobraste *¥${m}*`,
  m => `Fuiste la sorpresa del cumpleaños de alguien con mucho dinero y poco tacto. Generosa propina: *¥${m}*`,
  m => `Un extranjero de vacaciones pagó de más solo por practicar el idioma contigo. Recibiste *¥${m}*`,
  m => `Te contrataron para "acompañar" en una gala de beneficencia. Irónico, pero pagaron bien: *¥${m}*`,
  m => `Alguien pagó por tus fotos de pies en una plataforma que ni sabías que existía. Ganaste *¥${m}*`,
  m => `Hiciste de "novia falsa" para presentar en la cena familiar de alguien. Buena actuación, mejor pago: *¥${m}*`,
]

const command: Command = {
  name:        'slut',
  aliases:     ['prostituta', 'puta', 'escort', 'prepago'],
  description: 'Usa tus encantos para ganar BrasCoins +18 (1h cooldown)',
  category:    'rpg',
  cooldown:    0,
  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastHunt', CD)) {
      const left = getCooldownLeft(sender, 'lastHunt', CD)
      await sock.sendMessage(jid, {
        text: `> 😮‍💨 Aún no te recuperas. Vuelve en *${fmtCooldown(left)}*.`,
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const earned  = isPrem ? rand(3000, 10_000) : rand(1000, 6000)
    const story   = pick(SCENARIOS)

    patchUserData(sender, { money: user.money + earned })
    setCooldown(sender, 'lastHunt')

    await sock.sendMessage(jid, {
      text: `> ${story(earned)}\n\n_Próximo en 1h_`,
    }, { quoted: msg })
  },
}

export default command
