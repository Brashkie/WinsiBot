import type { Command } from '../../../types/index.js'
import { getUserData, patchUserData, getNumber } from '@core/events.js'

const n    = (jid: string) => jid.split('@')[0]!
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!

function getTarget(msg: any): string | undefined {
  return (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [])[0]
      ?? msg.message?.extendedTextMessage?.contextInfo?.participant
}

const FRASES = [
  'Hay momentos en los que no me gusta estar solo. Pero tampoco quiero que todos me acompañen, solo te quiero a ti.',
  'Me acabo de dar cuenta de que has sido lo que he estado buscando todo este tiempo. ¿Quieres ser mi pareja?',
  'Agradezco a mis ojos por haberme llevado a encontrarte.',
  'No soy el más grande, pero estoy seguro de que puedo hacerte feliz con amor y cariño. ¿Me quieres?',
  'Solo soy una persona común con muchos defectos. Si estás dispuesto a aceptarme, prometo hacer lo mejor para ti.',
  'Quiero ser la persona que te haga reír y sonreír todos los días. ¿Serás mi pareja?',
  'Te miro y veo el resto de mi vida ante mis ojos.',
  'No tengo todo, pero al menos tengo suficiente amor para ti.',
  'Realmente estoy enamorado de ti. ¿Serás mía?',
  'Que toda mi alegría sea tuya, toda tu tristeza sea mía. ¡Que el mundo entero sea tuyo, solo tú seas mía!',
  'Que el pasado sea mi pasado, pero por el presente, ¿serás tú mi futuro?',
  '¿Y si nos convertimos en una banda de ladrones? Yo robé tu corazón y tú me robaste el mío.',
  'Mi amor por ti es sincero desde el fondo de mi corazón.',
  'Quiero tener una charla seria contigo. Todo este tiempo he albergado sentimientos por ti.',
  'Feliz es que tú y yo nos hemos convertido en nosotros.',
  'No quiero que seas el sol de mi vida, porque aunque hace calor estás muy lejos. Solo quiero que seas la sangre que siempre está cerca de mí.',
  '¿Puedes darme una dirección a tu corazón? Parece que me he perdido en tus ojos.',
  'La forma en que puedes hacerme reír incluso en los días más oscuros me hace sentir más ligero que cualquier otra cosa.',
]

const command: Command = {
  name: 'pareja',
  aliases: ['couple', 'elegirpareja', 'serpareja', 'futurarelacion'],
  description: 'Propone una relación a alguien o muestra una pareja aleatoria del grupo',
  category: 'rpg',
  groupOnly: true,

  async execute({ sock, jid, msg, sender, pushName, command: cmd, prefix }) {
    // ── Futura relación: aleatorio del grupo ────────────────────────────────────
    if (cmd === 'futurarelacion') {
      const meta = await sock.groupMetadata(jid).catch(() => null)
      if (!meta || meta.participants.length < 2) {
        await sock.sendMessage(jid, {
          text: '> No hay suficientes miembros en el grupo.',
        }, { quoted: msg })
        return
      }
      const pool = meta.participants.map(p => p.id)
      const a    = pool[Math.floor(Math.random() * pool.length)]!
      const rest = pool.filter(id => id !== a)
      const b    = rest[Math.floor(Math.random() * rest.length)]!
      await sock.sendMessage(jid, {
        text: `💕 *Futura Relación*\n> @${n(a)} 💞 @${n(b)}`,
        mentions: [a, b],
      }, { quoted: msg })
      return
    }

    // ── Propuesta ───────────────────────────────────────────────────────────────
    const target = getTarget(msg)
    if (!target) {
      await sock.sendMessage(jid, {
        text: `> Etiqueta a quien quieres proponer una relación.\n> Ej: \`${prefix}pareja @usuario\``,
      }, { quoted: msg })
      return
    }

    if (target === sender) {
      await sock.sendMessage(jid, { text: '> No puedes proponerte a ti mismo.' }, { quoted: msg })
      return
    }

    if (getNumber(target) === getNumber(sock.user?.id ?? '')) {
      await sock.sendMessage(jid, { text: '> No puedo ser tu pareja 😄' }, { quoted: msg })
      return
    }

    const me   = getUserData(sender, pushName)
    const them = getUserData(target)

    const meConfirmed   = me.profile.marry !== '' && getUserData(me.profile.marry).profile.marry === sender
    const meHasPending  = me.profile.marry !== '' && !meConfirmed

    // Ya está en una relación confirmada con alguien distinto
    if (meConfirmed && me.profile.marry !== target) {
      const partnerName = getUserData(me.profile.marry).name || n(me.profile.marry)
      await sock.sendMessage(jid, {
        text: `> Ya estás en una relación con *${partnerName}*.\n> Usa \`${prefix}terminar\` primero.`,
      }, { quoted: msg })
      return
    }

    // Ya está saliendo con este mismo target
    if (meConfirmed && me.profile.marry === target) {
      await sock.sendMessage(jid, {
        text: `> Ya estás saliendo con @${n(target)} 💑`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    // Tiene una propuesta pendiente hacia otra persona
    if (meHasPending && me.profile.marry !== target) {
      const pendingName = getUserData(me.profile.marry).name || n(me.profile.marry)
      await sock.sendMessage(jid, {
        text: `> Ya tienes una propuesta pendiente con *${pendingName}*.\n> Usa \`${prefix}terminar\` para cancelarla primero.`,
      }, { quoted: msg })
      return
    }

    // El target ya tiene una relación confirmada
    const themConfirmed = them.profile.marry !== '' && getUserData(them.profile.marry).profile.marry === target
    if (themConfirmed) {
      const partnerName = getUserData(them.profile.marry).name || n(them.profile.marry)
      await sock.sendMessage(jid, {
        text: `> @${n(target)} ya está en una relación con *${partnerName}*.`,
        mentions: [target],
      }, { quoted: msg })
      return
    }

    // El target ya le propuso al sender → aceptar automáticamente
    if (them.profile.marry === sender) {
      patchUserData(sender, { profile: { marry: target } })
      const sName = me.name || pushName
      const tName = them.name || n(target)
      await sock.sendMessage(jid, {
        text: `🥳 *¡Felicidades!*\n\n@${n(sender)} 💑 @${n(target)}\n_${sName} y ${tName} ahora son pareja oficial._`,
        mentions: [sender, target],
      }, { quoted: msg })
      return
    }

    // Propuesta normal
    patchUserData(sender, { profile: { marry: target } })
    await sock.sendMessage(jid, {
      text: `💌 *@${n(sender)}* le propone una relación a *@${n(target)}*\n\n_"${pick(FRASES)}"_\n\n> ✅ Aceptar: \`${prefix}aceptar @${n(sender)}\`\n> ❌ Rechazar: \`${prefix}rechazar @${n(sender)}\``,
      mentions: [sender, target],
    }, { quoted: msg })
  },
}

export default command
