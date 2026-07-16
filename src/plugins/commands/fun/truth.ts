import type { Command } from '../../../types/index.js'
import { randomChoice as pick } from '@lib/utils.js'

const TRUTH_IMG = 'https://telegra.ph/file/069abbabe8e23828e560f.jpg'

const TRUTHS: string[] = [
  '¿Cuál es la mentira más grande que le dijiste a alguien del grupo?',
  '¿A quién le tienes más envidia y por qué?',
  '¿Cuál es tu mayor miedo que casi nadie conoce?',
  '¿Alguna vez leíste los mensajes de otra persona sin permiso?',
  '¿Cuál fue la excusa más ridícula que inventaste para faltar a algo?',
  '¿Qué es lo más vergonzoso que buscaste en internet?',
  '¿A quién bloqueaste alguna vez y por qué?',
  '¿Cuál es el secreto que jamás le contarías a tus padres?',
  '¿Alguna vez te gustó alguien de este grupo? No hace falta decir quién, solo si.',
  '¿Cuál es tu peor hábito que tratas de esconder?',
  '¿Qué es lo más caro que rompiste y nunca confesaste?',
  '¿Cuál fue la última vez que fingiste estar bien cuando no lo estabas?',
  '¿Alguna vez copiaste en un examen? ¿Te agarraron?',
  '¿Cuál es el chisme más grande que sabes y nunca contaste?',
  '¿Qué es lo más tonto que hiciste por impresionar a alguien?',
  '¿Cuál es tu mayor arrepentimiento de este último año?',
  '¿Alguna vez te hiciste pasar por otra persona en un chat?',
  '¿Cuál es la razón real por la que terminaste tu última relación (o amistad)?',
  '¿Qué es lo más raro que tienes guardado en tu celular?',
  '¿Alguna vez stalkeaste a alguien en redes por horas?',
  '¿Cuál es el cumplido falso que le diste a alguien solo por quedar bien?',
  '¿Qué es lo que más te arrepientes de haber publicado alguna vez?',
  '¿Cuál es tu mayor inseguridad?',
  '¿A quién admiras en secreto y nunca se lo dijiste?',
  '¿Cuál es la mayor tontería que hiciste por amor?',
  '¿Alguna vez fingiste que te gustaba algo solo para caerle bien a alguien?',
  '¿Cuál es el mensaje que más te arrepientes de haber mandado?',
  '¿Qué es lo más incómodo que te pasó en una videollamada?',
  '¿Alguna vez espiaste el celular de alguien más?',
  '¿Cuál es la cosa más rara que has hecho estando solo/a en tu casa?',
  '¿A quién le tienes más paciencia de la que deberías?',
  '¿Cuál fue la razón más tonta por la que discutiste con alguien?',
  '¿Qué es lo que más te cuesta admitir de vos mismo/a?',
  '¿Alguna vez dijiste que estabas ocupado/a solo para no ver a alguien?',
  '¿Cuál es tu red social donde más tiempo perdés sin darte cuenta?',
  '¿Qué es lo más vergonzoso que te dijeron en la cara?',
  '¿Cuál es la comida que decís que odiás pero en realidad te gusta?',
  '¿Alguna vez culpaste a otra persona por algo que hiciste vos?',
  '¿Cuál es el mayor miedo que tenés sobre el futuro?',
  '¿Qué es lo más caro que gastaste sin necesitarlo realmente?',
  '¿Alguna vez fingiste estar enfermo/a para no ir a algún lado?',
  '¿Cuál es la serie o película que viste a escondidas de todos?',
  '¿A quién extrañás y nunca se lo dijiste?',
  '¿Cuál es la crítica que más te dolió, aunque tuvieran razón?',
  '¿Alguna vez revisaste el estado de WhatsApp de alguien más de 10 veces en un día?',
  '¿Cuál es tu peor recuerdo de una fiesta o reunión?',
  '¿Qué es lo que menos te gusta de tu propia personalidad?',
  '¿Alguna vez mentiste sobre tu edad, trabajo o estudios para impresionar?',
  '¿Cuál es el consejo que te dieron y nunca seguiste?',
  '¿A quién del grupo elegirías para sobrevivir un apocalipsis y a quién no?',
  '¿Cuál es tu mayor logro que nadie reconoció como merecía?',
  '¿Alguna vez te arrepentiste de perdonar a alguien?',
  '¿Cuál es el hábito de otra persona que más te molesta en silencio?',
  '¿Cuál fue la mentira piadosa más grande que le dijiste a un amigo?',
  '¿Alguna vez te hiciste el/la dormido/a para no hablar con alguien?',
  '¿Cuál es el apodo que odiás pero nunca dijiste nada?',
  '¿Qué es lo más ridículo que creíste de chico/a?',
  '¿Alguna vez borraste una conversación entera por miedo a que la vean?',
  '¿Cuál es la promesa que hiciste y no cumpliste?',
  '¿Qué es lo que más te choca de la gente y tratás de no juzgar?',
  '¿Alguna vez te reíste de algo que en realidad no te causó gracia?',
  '¿Cuál es el momento más incómodo que viviste frente a toda tu familia?',
  '¿Qué es lo que dirías de vos mismo/a si tuvieras que ser 100% honesto/a?',
  '¿Alguna vez fingiste conocer algo (una película, libro, tema) para no quedar mal?',
  '¿Cuál es la cosa más cara que te gustaría comprarte y no podés?',
  '¿Qué es lo que más extrañás de cuando eras más chico/a?',
  '¿Alguna vez sentiste celos de un amigo cercano?',
  '¿Cuál fue el chisme que empezaste sin querer que se hiciera tan grande?',
  '¿Qué es lo que más te cuesta perdonar en una amistad?',
  '¿Alguna vez dijiste "estoy bien" cuando en realidad querías llorar?',
  '¿Cuál es el error que cometiste dos veces a propósito?',
  '¿Qué es lo más loco que harías si supieras que nadie se va a enterar?',
  '¿Alguna vez sentiste que no encajabas en un grupo de amigos?',
  '¿Cuál es la cosa que más te cuesta decir en voz alta?',
  '¿Qué es lo que más admirás de alguien de este grupo, aunque nunca lo dijiste?',
  '¿Alguna vez te arrepentiste de un tatuaje, corte de pelo o cambio de look?',
  '¿Cuál es tu recuerdo más vergonzoso de la primaria o secundaria?',
  '¿Qué es lo que más te asusta de crecer o hacerte más grande?',
  '¿Alguna vez fuiste tú el/la responsable de un problema y dejaste que culparan a otro?',
  '¿Cuál es la cosa más random que te da nostalgia sin razón aparente?',
  '¿Qué es lo primero que pensás cuando te despiertan de golpe?',
  '¿Alguna vez soñaste con alguien del grupo? No hace falta dar detalles.',
]

const command: Command = {
  name:        'verdad',
  aliases:     ['truth'],
  description: 'Pregunta random para jugar Verdad o Reto',
  category:    'fun',
  cooldown:    5,

  async execute({ sock, jid, msg, sender }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant
    const target      = mentionRaw ?? quotedRaw ?? sender
    const targetNum   = target.split('@')[0]

    const truth = pick(TRUTHS)

    const caption = [
      `╭─「 💭 VERDAD 」`,
      `│`,
      `│ ${truth}`,
      `│`,
      `│ § Para: @${targetNum}`,
      `╰─ ${TRUTHS.length} preguntas en el mazo`,
    ].join('\n')

    await sock.sendMessage(jid, {
      image:    { url: TRUTH_IMG },
      caption,
      mentions: [target],
    }, { quoted: msg })
  },
}

export default command
