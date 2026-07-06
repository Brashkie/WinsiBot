import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'

const CD = 10 * 60_000

// Cada entrada recibe el monto y devuelve la frase completa
const JOBS: Array<(m: number) => string> = [
  m => `Tu jefe te pidió quedarte hasta la medianoche a terminar el informe del lunes y al final te pagó horas extras. Ganaste *¥${m}*`,
  m => `Abriste una cuenta de OnlyFans de tu gato y se volvió viral entre las viejitas del barrio. Tus fans enviaron donaciones y ganaste *¥${m}*`,
  m => `Subiste un video haciendo lip-sync mal sincronizado y TikTok te lo puso en el FYP de medio país. Las marcas te contactaron y ganaste *¥${m}*`,
  m => `Vendiste tus cromos de Pokémon que tenías guardados desde el 2002. Un collector pagó el triple por una carta que tú creías que era falsa. Ganaste *¥${m}*`,
  m => `Te contrataron como moderador de un grupo de WhatsApp con 500 señoras hablando de recetas. Sobreviviste una semana y te pagaron *¥${m}*`,
  m => `Hiciste delivery en bicicleta bajo la lluvia y un cliente te dio propina extra porque le recordaste a su hijo. Recibiste *¥${m}*`,
  m => `Diseñaste el logo de una panadería en 20 minutos con Canva y el dueño lo llamó "obra de arte". Te transfirió *¥${m}*`,
  m => `Participaste en una encuesta online de 3 horas sobre qué sabor de galleta prefieren los millenials. Te compensaron con *¥${m}*`,
  m => `Tu vecino te pagó para que le enseñaras a usar WhatsApp Web y pasaste 4 horas explicándole qué es el QR. Ganaste *¥${m}*`,
  m => `Tradujiste un manual de instrucciones de una lavadora del chino al español. Gramaticalmente quedó igual de confuso pero te pagaron *¥${m}*`,
  m => `Te pusiste a minar crypto con tu computadora vieja y el ventilador casi despega. Después de pagar la luz te quedaron *¥${m}*`,
  m => `Ganaste un torneo de matatena en el parque. El premio era simbólico pero el abuelo organizador te dio *¥${m}* de su bolsillo`,
  m => `Cocinaste en un restaurante toda la noche y el chef te gritó en tres idiomas. Al final te pagaron *¥${m}* y una sopa gratis`,
  m => `Escribiste 10 artículos para un blog de astrología diciendo que "Mercurio en retrógrado" causaba todo. Te pagaron *¥${m}*`,
  m => `Actuaste como extra en una publicidad local de colchones. Dormiste de verdad en cámara y te ganaste *¥${m}*`,
  m => `Le arreglaste la impresora al contador de la empresa. Llevaba 3 años diciéndole a todos que era el cable. Agradecido te dio *¥${m}*`,
  m => `Vendiste riñas de gallos NFT en una blockchain que nadie usa. Encontraste a un comprador y ganaste *¥${m}*`,
  m => `Pasaste toda la tarde grabando reels de "productividad" y en realidad no hiciste nada productivo. Las vistas te generaron *¥${m}*`,
  m => `Desarrollaste una app para recordarle a la gente que tome agua. Se descargó 3 veces pero una era premium: *¥${m}*`,
  m => `Fuiste al banco a cobrar un cheque del abuelo de 1998. Todavía era válido. Recibiste *¥${m}* más los intereses`,
  m => `Participaste en un game show local donde adivinabas el precio de las cosas del supermercado. Ganaste *¥${m}* y un paquete de fideos`,
  m => `Enseñaste inglés por Zoom a niños de primaria y en la primera clase alguien te preguntó si eras un robot. Te pagaron *¥${m}*`,
  m => `Limpiaste la piscina del vecino rico y te invitó a la parrillada de después. No comiste pero te pagó *¥${m}*`,
  m => `Subiste a Fiverr que sabías hacer "cualquier cosa" y alguien te contrató para escribir un discurso de bodas. Cobraste *¥${m}*`,
  m => `Completaste la mayoría de edad y tus padres te consiguieron trabajo el mismo día. ¡Bienvenido a la sociedad! Recibiste *¥${m}*`,
  m => `Ayudaste a la abuela del barrio a armar su árbol de navidad de 47 piezas en pleno julio. Feliz te dio *¥${m}*`,
  m => `Moderaste un servidor de Discord de fans de anime toda la noche. Mano dura. Regla de no spoilers. Te pagaron *¥${m}*`,
  m => `Encontraste un bug en el sitio web de una empresa y les mandaste un reporte. Tenían programa de bug bounty: *¥${m}*`,
  m => `Le hiciste el currículum a un amigo. Lo llamaron para la entrevista. No lo contrataron pero a ti te pagó *¥${m}* de comisión moral`,
  m => `Cultivaste tomates en el balcón y los vendiste en el grupo del condominio antes de que los comprara el de siempre. Ganaste *¥${m}*`,
  m => `Te pasaste el fin de semana arreglando la PC del tío. Era virus. Era siempre virus. Llegaste y quitaste la barra de Babylon. Te dio *¥${m}*`,
  m => `Hiciste de voluntario en una rifa y al final te quedaste con el premio que nadie reclamó: *¥${m}*`,
  m => `Vendiste apuntes de la universidad que hiciste con ChatGPT. Nadie lo notó. Ganaste *¥${m}*`,
  m => `Ganaste un concurso de programación en donde todos los demás pusieron código de Stack Overflow. Tú pusiste el tuyo y funcionó: *¥${m}*`,
  m => `Te pagaron por testear una app de meditación durante 8 horas seguidas. Te quedaste dormido 6 veces. Cuenta como meditación profunda: *¥${m}*`,
  m => `Abriste un puesto de limonada a las 3pm del verano. Vendiste todo en 20 minutos. Ganaste *¥${m}*`,
  m => `Pasaste horas editando el video de la quinceañera de tu prima. Pusiste transiciones de PowerPoint y la familia lloró de emoción. Te pagaron *¥${m}*`,
  m => `Actuaste como "experto en tecnología" en el noticiero local. Dijiste "inteligencia artificial" 12 veces y te pagaron *¥${m}*`,
  m => `Ganaste una apuesta con el grupo de que podías aguantar sin ver el celular 2 horas. Ganaste *¥${m}* y una pequeña crisis existencial`,
  m => `Hiciste el trabajo de tu compañero que "no tenía tiempo". Tú tampoco tenías tiempo. Pero te dio *¥${m}*`,
]

const command: Command = {
  name: 'work',
  aliases: ['trabajar', 'trabajo', 'w'],
  description: 'Trabaja cada 10 minutos para ganar BrasCoins',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName }) {
    if (isOnCooldown(sender, 'lastWork', CD)) {
      const left = getCooldownLeft(sender, 'lastWork', CD)
      await sock.sendMessage(jid, {
        text: `> ⏳ Espera *${fmtCooldown(left)}* para volver a trabajar.`,
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const earned  = isPrem ? rand(1000, 4000) : rand(300, 1500)
    const expGain = rand(50, 200)
    const jobFn   = pick(JOBS)

    patchUserData(sender, {
      money: user.money + earned,
      exp:   user.exp + expGain,
    })
    setCooldown(sender, 'lastWork')

    const leveled = checkLevelUp(sender)
    const lvlLine = levelUpLine(leveled)

    await sock.sendMessage(jid, {
      text: `> ${jobFn(earned)}${lvlLine}\n\n_Próximo trabajo en 10 min_`,
    }, { quoted: msg })
  },
}

export default command
