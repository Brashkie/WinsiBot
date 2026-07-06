import type { Command } from '../../../types/index.js'

const INSULTOS = [
  // clasicos
  'cerebro de mosquito',
  'cara de nalga de iguana',
  'hijo de una lavadora descompuesta',
  'individuo de dudosa procedencia',
  'ser de baja estofa',
  'espécimen raro de la naturaleza',
  'criatura del inframundo',
  'alma de cántaro',
  'melón sin madurar',
  'cactus con patas',
  // latinoamericanos
  'weón culiao',
  'huevón de cuarta',
  'patán de barrio',
  'naco redomado',
  'maje con cara de tabla',
  'tipo con el cerebro de pollo',
  'pata de perro con sarna',
  'pelotudo de primera división',
  'boludo profesional con diploma',
  'cretino con uniforme de idiota',
  // creativos
  'error de la naturaleza con zapatos',
  'ser humano en versión beta sin actualizar',
  'experimento fallido del universo',
  'prototipo defectuoso de persona',
  'bug viviente sin parche disponible',
  'wifi de dos barras en zona sin señal',
  'usb que nunca conecta a la primera',
  'cargador que solo funciona en ciertos ángulos',
  'auricular con el cable enredado para siempre',
  'impresora sin tinta en momento de urgencia',
  // filosóficos
  'encarnación del caos primordial',
  'paradoja ambulante de la estupidez',
  'anomalía estadística de la inteligencia',
  'prueba viviente del darwinismo fallido',
  'símbolo del desperdicio evolutivo',
  // graciosos
  'orgullo de su árbol genealógico pero del raíz',
  'persona con cara de lunes por la mañana',
  'ser tan inútil que hasta su sombra lo abandona',
  'individuo que confunde respirar con pensar',
  'tipo que nació en viernes 13 y se nota',
  'alma que googlea cómo se llama el país en que vive',
  'persona que se pierde en pasillos rectos',
  'ser que necesita GPS para encontrar su propia nariz',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

const command: Command = {
  name: 'insultar',
  aliases: ['insult', 'abuse', 'ofender'],
  description: 'Insulta a alguien creativamente',
  category: 'fun',
  groupOnly: true,
  cooldown: 5,

  async execute({ sock, jid, msg, sender }) {
    const ctx        = msg.message?.extendedTextMessage?.contextInfo
    const mentionRaw = ctx?.mentionedJid?.[0]
    const quotedRaw  = ctx?.participant
    const rawTarget  = mentionRaw ?? quotedRaw ?? sender

    let finalJid  = rawTarget
    let targetNum = (rawTarget.split('@')[0] ?? '').replace(/[^0-9]/g, '')

    try {
      const metadata    = await sock.groupMetadata(jid)
      const participant = metadata.participants.find(p =>
        p.id === rawTarget || (p as any).lid === rawTarget
      )
      if (participant) {
        finalJid  = participant.id
        targetNum = participant.id.split('@')[0] ?? targetNum
      }
    } catch {}

    const insulto  = pickRandom(INSULTOS)
    const senderNum = (sender.split('@')[0] ?? '').replace(/[^0-9]/g, '')
    const isSelf    = rawTarget === sender

    const lines = [
      `┌──────────────────────`,
      `│ ◆ INSULTO CERTIFICADO`,
      `└──────────────────────`,
      ``,
      isSelf
        ? ` @${targetNum} se insultó a sí mismo...`
        : ` @${senderNum} le dice a @${targetNum}:`,
      ``,
      `> *"Eres un ${insulto}"*`,
    ]

    await sock.sendMessage(jid, {
      text:     lines.join('\n'),
      mentions: [sender, finalJid],
    }, { quoted: msg })
  },
}

export default command