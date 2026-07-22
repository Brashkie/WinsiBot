import type { Command } from '../../../types/index.js'
import { randomChoice as pick } from '@lib/utils.js'

const DARE_IMG = 'https://telegra.ph/file/49e9327b85f47b7a9f523.jpg'

const DARES: string[] = [
  'Manda un audio cantando la primera canción que aparezca en tu playlist.',
  'Escribe en el grupo el último meme que guardaste en tu galería.',
  'Cuenta cuál fue la mentira más grande que le dijiste a tu familia.',
  'Cambia tu foto de perfil por 1 hora a algo que el grupo elija.',
  'Manda la última foto que sacaste, sin explicar el contexto.',
  'Escribe con la mano contraria a la que usas normalmente y manda la foto.',
  'Imita el acento de otro país en un audio de 15 segundos.',
  'Cuenta la historia más vergonzosa que te haya pasado en público.',
  'Manda un audio diciendo un trabalenguas 3 veces seguidas sin trabarte.',
  'Pon de estado de WhatsApp "Estoy pensando..." por 30 minutos.',
  'Describe tu día usando solo emojis.',
  'Manda una foto de lo primero que encuentres en tu heladera.',
  'Haz una rima improvisada sobre el grupo y mándala en audio.',
  'Cuenta cuál fue tu peor nota en la escuela/universidad y por qué.',
  'Escribe tu horóscopo de hoy inventado, lo más ridículo posible.',
  'Manda un audio imitando a un noticiero anunciando algo random.',
  'Cuenta el apodo más vergonzoso que te hayan puesto.',
  'Escribe una declaración de amor exagerada a tu comida favorita.',
  'Cuenta cuál fue la última vez que lloraste viendo algo.',
  'Manda una captura de tus canciones más escuchadas del mes.',
  'Describe a la última persona con la que hablaste, sin decir su nombre.',
  'Cuenta un secreto random que nadie del grupo sepa de vos.',
  'Haz de vendedor y trata de "vendernos" un objeto random de tu cuarto.',
  'Escribe cómo te imaginas dentro de 10 años, en una frase.',
  'Manda un audio leyendo el último mensaje que recibiste como si fuera un tráiler de película.',
  'Cambia tu nombre de perfil por 1 hora al que el grupo decida.',
  'Cuenta cuál fue la excusa más creativa que usaste para faltar a algo.',
  'Manda una foto de tus zapatillas o calzado actual, sin importar el estado.',
  'Describe a tu mejor amigo/a usando solo 3 palabras.',
  'Cuenta cuál fue el regalo más feo que recibiste y de quién.',
  'Haz un audio contando un chiste malo lo más serio posible.',
  'Escribe tu lista de compras del súper como si fuera poesía.',
  'Manda la última nota de voz que grabaste y borraste sin enviar (si existe).',
  'Cuenta cuál fue tu primer usuario/apodo en internet.',
  'Imita cómo habla alguien del grupo en un audio, sin decir quién es.',
  'Escribe 5 cosas que tengas cerca tuyo ahora mismo, en orden random.',
  'Manda una foto de la última serie o película que viste en tu pantalla.',
  'Cuenta cuál fue la peor decisión de moda que tomaste alguna vez.',
  'Describe tu comida favorita como si fueras un crítico gastronómico exagerado.',
  'Manda un audio recitando el abecedario al revés lo más rápido posible.',
  'Cuenta la razón real por la que llegaste tarde la última vez.',
  'Escribe una reseña de 1 estrella sobre tu propia semana.',
  'Manda una captura de tu batería y hora actual, sin editar nada.',
  'Cuenta cuál fue el mote más raro que le pusiste a alguien.',
  'Haz un audio anunciando el clima de mañana como si fueras del noticiero.',
  'Describe el último sueño raro que recuerdes haber tenido.',
  'Manda una foto del techo de donde estés ahora mismo.',
  'Cuenta cuál app tienes más tiempo usada esta semana y por qué.',
  'Escribe cómo te describirías en tu propio obituario, en tono cómico.',
  'Manda un audio agradeciendo un premio inventado como si lo acabaras de ganar.',
  'Cuenta cuál fue la cosa más random que compraste sin necesitarla.',
  'Describe tu cuarto/habitación en una sola oración exagerada.',
  'Manda un emoji que represente tu estado de ánimo ahora, sin explicarlo.',
  'Manda un audio hablando como si fueras un locutor de radio presentando el grupo.',
  'Cuenta cuál fue el objeto más raro que perdiste y nunca apareció.',
  'Escribe una carta de despedida exagerada a tu comida chatarra favorita.',
  'Manda una foto de tu mano haciendo el símbolo de la paz, sin salir vos.',
  'Cuenta cuál fue la peor cita o encuentro incómodo que tuviste.',
  'Haz un audio contando hasta 20 en otro idioma que no domines bien.',
  'Describe el clima de hoy como si fuera el fin del mundo.',
  'Manda una captura de tu fondo de pantalla actual.',
  'Cuenta cuál es la palabra que más repetís sin darte cuenta.',
  'Escribe un anuncio publicitario exagerado vendiendo al grupo.',
  'Manda un audio despidiéndote como si te fueras a otro país para siempre.',
  'Cuenta cuál fue el disfraz más ridículo que usaste alguna vez.',
  'Describe tu último dolor de cabeza como si fuera una tragedia griega.',
  'Manda una foto de algo verde que tengas cerca.',
  'Cuenta cuál es tu mayor manía que los demás notan enseguida.',
  'Haz un audio narrando lo que estás haciendo ahora como documental de naturaleza.',
  'Escribe el título de la película de tu vida hasta hoy.',
  'Manda una captura de la última búsqueda random que hiciste en internet.',
  'Cuenta cuál fue la excusa más rara que diste para no contestar un mensaje.',
  'Describe a tu mascota (o una imaginaria) como si fuera un superhéroe.',
  'Manda un audio cantando el estribillo de una canción infantil.',
  'Cuenta cuál fue tu primera impresión de alguien del grupo.',
  'Escribe tu currículum como si aplicaras para "Mejor amigo/a del grupo".',
  'Manda una foto de algo que esté sobre tu mesa o escritorio ahora.',
  'Cuenta cuál es el ruido más molesto que no soportás.',
  'Haz un audio hablando como si fueras un GPS dando indicaciones absurdas.',
  'Describe tu look de hoy como si fuera una pasarela de moda.',
  'Manda un audio riéndote de la forma más falsa posible por 10 segundos.',
  'Cuenta cuál fue el consejo más inútil que te dieron alguna vez.',
]

const command: Command = {
  name:        'reto',
  aliases:     ['dare'],
  description: 'Reto aleatorio para jugar en el grupo',
  category:    'fun',
  cooldown:    5,

  async execute({ sock, jid, msg, sender }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant
    const target      = mentionRaw ?? quotedRaw ?? sender
    const targetNum   = target.split('@')[0]

    const dare = pick(DARES)

    const caption = [
      `╭─「 🔥 RETO 」`,
      `│`,
      `> ${dare}`,
      `│`,
      `│ § Para: @${targetNum}`,
      `╰─ ${DARES.length} retos en el mazo`,
    ].join('\n')

    await sock.sendMessage(jid, {
      image:    { url: DARE_IMG },
      caption,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
