import type { Command } from '../../../types/index.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
  checkLevelUp, levelUpLine,
} from '@core/events.js'
import { randomNumber as rand, randomChoice as pick } from '@lib/utils.js'
import { tx, type Idioma } from '@lib/i18n.js'

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
  m => `Le enseñaste a tu abuela a mandar audios de WhatsApp. Ahora manda 40 al día pero te lo agradeció con *¥${m}*`,
  m => `Vendiste tu vieja consola en el grupo de "compra y venta" del barrio antes de que alguien notara que le faltaba un cable. Ganaste *¥${m}*`,
  m => `Te contrataron por un día para hacer de "cliente misterioso" en un restaurante. Comiste gratis y encima cobraste *¥${m}*`,
  m => `Armaste un mueble de IKEA para un vecino que llevaba 3 fines de semana intentándolo. Sobraron 4 tornillos, nadie preguntó. Te pagó *¥${m}*`,
  m => `Hiciste de DJ en el cumpleaños de un primo con el celular y una bocina bluetooth. La pista se llenó igual. Te dieron *¥${m}*`,
  m => `Pasaste la tarde respondiendo reseñas de un negocio local haciéndote pasar por "atención al cliente". Te pagaron *¥${m}*`,
  m => `Cuidaste el perro de un vecino que solo quería morder los cables del cargador. Sobreviviste el cargador (casi) y ganaste *¥${m}*`,
  m => `Escribiste la biografía de Instagram de un influencer local que no sabía qué poner. "Viviendo el momento ✨" fue suficiente: *¥${m}*`,
  m => `Te pagaron por hacer fila en el banco por alguien que odiaba hacer fila. Tres horas después, cobraste *¥${m}*`,
  m => `Organizaste el clóset de alguien que juraba que "así encontraba todo más rápido". No era cierto. Te pagó igual *¥${m}*`,
  m => `Grabaste un video de "unboxing" para una tienda que vende fundas de celular. Le pusiste dramatismo de más. Cobraste *¥${m}*`,
  m => `Le hiciste de intérprete a un turista perdido que solo hablaba en señas y emojis. Te agradeció con *¥${m}*`,
  m => `Reparaste el wifi de la oficina apagando y prendiendo el router. Te llamaron "el de sistemas" el resto del día. Ganaste *¥${m}*`,
  m => `Vendiste boletos de una rifa que ni sabías de qué era el premio. Se agotaron todos igual. Comisión: *¥${m}*`,
  m => `Le diste like y comentario a 200 publicaciones para "subir el engagement" de un emprendimiento nuevo. Pagaron *¥${m}*`,
]

// En inglés y portugués no son traducciones de las de arriba: son chistes
// propios, que no dependen de algo de Perú o de la escuela de acá.
const JOBS_EN: Array<(m: number) => string> = [
  m => `Your boss asked you to stay until midnight to finish Monday's report, and paid overtime. You earned *¥${m}*`,
  m => `You opened an OnlyFans for your cat and the grandmas of the block went wild. Donations: *¥${m}*`,
  m => `Your badly synced lip-sync video landed on half the country's For You page. Brands called: *¥${m}*`,
  m => `You sold the Pokémon cards you kept since 2002. A collector paid triple for one you thought was fake: *¥${m}*`,
  m => `You moderated a WhatsApp group of 500 ladies swapping recipes. You survived a week and got *¥${m}*`,
  m => `You delivered food by bike in the rain and a customer tipped extra because you reminded him of his son: *¥${m}*`,
  m => `You designed a bakery logo in 20 minutes on Canva and the owner called it "art". He sent you *¥${m}*`,
  m => `You taught your neighbor to use WhatsApp Web and spent 4 hours explaining the QR code. You earned *¥${m}*`,
  m => `You mined crypto on your old laptop and the fan almost took off. After the power bill you kept *¥${m}*`,
  m => `You cooked all night in a restaurant while the chef yelled in three languages. You got *¥${m}* and free soup`,
  m => `You were an extra in a mattress commercial. You actually fell asleep on camera and earned *¥${m}*`,
  m => `You fixed the accountant's printer. For 3 years he blamed the cable. Grateful, he gave you *¥${m}*`,
  m => `You built an app that reminds people to drink water. 3 downloads, one of them premium: *¥${m}*`,
  m => `You taught English over Zoom and a kid asked if you were a robot. They paid you *¥${m}*`,
  m => `You said on Fiverr you could do "anything" and someone hired you to write a wedding speech: *¥${m}*`,
  m => `You found a bug on a company's website and reported it. They had a bug bounty: *¥${m}*`,
  m => `You fixed the office wifi by turning the router off and on. They called you "the IT guy" all day: *¥${m}*`,
  m => `You assembled an IKEA wardrobe for a neighbor after his 3 failed weekends. 4 screws left over, nobody asked: *¥${m}*`,
  m => `You queued at the bank for someone who hates queues. Three hours later you cashed *¥${m}*`,
  m => `You liked and commented on 200 posts to "boost engagement" for a new small business. They paid *¥${m}*`,
]

const JOBS_PT: Array<(m: number) => string> = [
  m => `Seu chefe pediu pra ficar até meia-noite terminando o relatório de segunda e pagou hora extra. Você ganhou *¥${m}*`,
  m => `Você abriu um OnlyFans do seu gato e as vovós do bairro piraram. Doações: *¥${m}*`,
  m => `Seu vídeo de dublagem fora de sincronia caiu no Para Você de meio país. As marcas ligaram: *¥${m}*`,
  m => `Você vendeu as cartas de Pokémon guardadas desde 2002. Um colecionador pagou o triplo por uma que você achava falsa: *¥${m}*`,
  m => `Você moderou um grupo de WhatsApp com 500 tias trocando receitas. Sobreviveu uma semana e levou *¥${m}*`,
  m => `Você fez entrega de bike na chuva e o cliente deu gorjeta extra porque você lembrou o filho dele: *¥${m}*`,
  m => `Você fez a logo de uma padaria em 20 minutos no Canva e o dono chamou de "obra de arte". Mandou *¥${m}*`,
  m => `Você ensinou o vizinho a usar o WhatsApp Web e passou 4 horas explicando o QR code. Ganhou *¥${m}*`,
  m => `Você minerou cripto no notebook velho e a ventoinha quase decolou. Depois da conta de luz sobraram *¥${m}*`,
  m => `Você cozinhou a noite toda num restaurante com o chef gritando em três idiomas. Levou *¥${m}* e uma sopa grátis`,
  m => `Você foi figurante num comercial de colchão. Dormiu de verdade na gravação e ganhou *¥${m}*`,
  m => `Você consertou a impressora do contador. Fazia 3 anos que ele culpava o cabo. Agradecido, deu *¥${m}*`,
  m => `Você criou um app que lembra as pessoas de beber água. 3 downloads, um deles premium: *¥${m}*`,
  m => `Você deu aula de inglês pelo Zoom e uma criança perguntou se você era um robô. Pagaram *¥${m}*`,
  m => `Você disse no Fiverr que fazia "qualquer coisa" e te contrataram pra escrever um discurso de casamento: *¥${m}*`,
  m => `Você achou um bug no site de uma empresa e avisou. Tinham bug bounty: *¥${m}*`,
  m => `Você arrumou o wifi do escritório desligando e ligando o roteador. Te chamaram de "o da TI" o dia todo: *¥${m}*`,
  m => `Você montou um guarda-roupa pro vizinho depois de 3 fins de semana de fracasso dele. Sobraram 4 parafusos: *¥${m}*`,
  m => `Você ficou na fila do banco por alguém que odeia fila. Três horas depois, recebeu *¥${m}*`,
  m => `Você curtiu e comentou 200 posts pra "subir o engajamento" de um negócio novo. Pagaram *¥${m}*`,
]

const TRABAJOS: Record<Idioma, Array<(m: number) => string>> = { es: JOBS, en: JOBS_EN, pt: JOBS_PT }

const T = {
  espera:  { es: '> ⏳ Espera *{t}* para volver a trabajar.', en: '> ⏳ Wait *{t}* to work again.', pt: '> ⏳ Espere *{t}* para trabalhar de novo.' },
  brasas:  { es: '\n> +{n} BrasEmbers (¡raro!)', en: '\n> +{n} BrasEmbers (rare!)', pt: '\n> +{n} BrasEmbers (raro!)' },
  proximo: { es: '_Próximo trabajo en 10 min_', en: '_Next job in 10 min_', pt: '_Próximo trabalho em 10 min_' },
}

const command: Command = {
  name: 'work',
  aliases: ['trabajar', 'trabajo', 'w'],
  description: 'Trabaja cada 10 minutos para ganar BrasCoins',
  category: 'rpg',
  cooldown: 0,

  async execute({ sock, jid, msg, sender, pushName, lang }) {
    if (isOnCooldown(sender, 'lastWork', CD)) {
      const left = getCooldownLeft(sender, 'lastWork', CD)
      await sock.sendMessage(jid, {
        text: tx(lang, T.espera, { t: fmtCooldown(left) }),
      }, { quoted: msg })
      return
    }

    const user    = getUserData(sender, pushName)
    const isPrem  = user.premium
    const earned  = isPrem ? rand(1000, 4000) : rand(300, 1500)
    const expGain = rand(50, 200)
    const jobFn   = pick(TRABAJOS[lang])
    // BrasEmbers — moneda rara para comandos NSFW, chance chica
    const embers  = Math.random() < 0.04 ? 1 : 0

    patchUserData(sender, {
      money:  user.money + earned,
      exp:    user.exp + expGain,
      embers: user.embers + embers,
    })
    setCooldown(sender, 'lastWork')

    const leveled   = checkLevelUp(sender)
    const lvlLine   = levelUpLine(leveled, jid, lang)
    const emberLine = embers > 0 ? tx(lang, T.brasas, { n: embers }) : ''

    await sock.sendMessage(jid, {
      text: `> ${jobFn(earned)}${lvlLine}${emberLine}\n\n${tx(lang, T.proximo)}`,
    }, { quoted: msg })
  },
}

export default command
