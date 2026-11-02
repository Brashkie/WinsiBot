// Quién es dueño del bot: la llave de los comandos de owner.
//
// Solo se compara contra un NÚMERO DE TELÉFONO (`@s.whatsapp.net`): el del
// remitente, o el que WhatsApp pone en `participantPn`/`senderPn` cuando el
// remitente llega como @lid. Hasta la 9.2 también se comparaban los dígitos
// de un @lid contra el número del dueño: un @lid es un identificador opaco,
// no un teléfono, y nada garantizaba que no coincidiera con uno.
//
// Sin alias de importación, para poder probarlo.

/** Los dígitos del usuario: `51999:12@s.whatsapp.net` → `51999`. */
function numero(jid: string): string {
  return (jid.split('@')[0] ?? '').split(':')[0]!.replace(/\D/g, '')
}

const esTelefono = (jid: string) => jid.endsWith('@s.whatsapp.net')

/**
 * @param sender      quien mandó el mensaje, como lo trae `msg.key`.
 * @param candidatoPn `participantPn`/`senderPn`: el teléfono del remitente,
 *                    que pone el servidor de WhatsApp y no el usuario.
 * @param duenos      `OWNER_JID`: números sueltos o jids.
 */
export function esDueno(sender: string, candidatoPn: string, duenos: readonly string[]): boolean {
  const telefonos = [sender, candidatoPn].filter((j) => j && esTelefono(j)).map(numero)
  return duenos.some((o) => {
    // Un dueño configurado con su @lid exacto también vale, pero solo igual.
    if (o.endsWith('@lid')) return o === sender
    const n = numero(o.includes('@') ? o : `${o}@s.whatsapp.net`)
    return n !== '' && telefonos.includes(n)
  })
}

/** La parte de usuario de un jid: `31908:3@lid` → `31908`. */
const usuario = (jid: string) => (jid.split('@')[0] ?? '').split(':')[0] ?? ''
const dominio = (jid: string) => jid.split('@')[1] ?? ''

/**
 * Si el mensaje lo mandó la propia cuenta del bot, desde otro de sus
 * dispositivos (el teléfono con el que se vinculó). Quien la maneja ya puede
 * hacer cualquier cosa con ella, así que es dueño aunque su número no esté en
 * OWNER_JID: hasta la 9.3.0 salía "Owner ✗ No".
 *
 * Como en `esDueno`, cada cosa contra su igual: un @lid contra el @lid del
 * bot, un teléfono contra su teléfono. Nunca un @lid contra un número.
 *
 * @param botId  `sock.user.id`, el teléfono del bot (`51999:3@s.whatsapp.net`).
 * @param botLid `sock.user.lid`, su @lid (`31908:3@lid`), si se conoce.
 */
export function esLaCuentaDelBot(sender: string, botId: string, botLid: string): boolean {
  if (!sender) return false
  return [botId, botLid].some(
    (b) => b !== '' && dominio(b) === dominio(sender) && usuario(b) !== '' && usuario(b) === usuario(sender),
  )
}
