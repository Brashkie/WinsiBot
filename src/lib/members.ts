// Los miembros de un grupo, reconocidos por cualquiera de sus ids.
//
// En grupos que direccionan por LID, `participant` llega como `xxx@lid` y no
// como el número; groupMetadata puede traer el `id` en un formato y el otro en
// `lid`, `jid` o `phoneNumber`, según la versión de WhatsApp. El historial de
// mensajes guarda el remitente tal como llegó. Para saber si un miembro
// escribió hay que mirar TODOS sus ids, no uno.

import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { getGroupParticipants } from '@core/groupCache.js'
import { winsiStore } from '@core/store.js'

export interface Miembro {
  id:     string
  ids:    string[]          // todos los conocidos, para cruzar con otros datos
  numero: string | null     // el número real, si se conoce (en LID puede no estar)
  admin:  boolean
}

const esNumero = (j?: string | null) => !!j && j.endsWith('@s.whatsapp.net')

export async function miembros(sock: WASocket, gjid: string): Promise<Miembro[]> {
  const ps = await getGroupParticipants(sock, gjid)
  return ps.map((p: any) => {
    const ids = [p.id, p.lid, p.jid, p.phoneNumber].filter((x): x is string => typeof x === 'string' && x.length > 0)
    let numero = ids.find(esNumero) ?? null
    if (!numero) {
      // Un LID sin número a la vista: el store lo conoce si ya lo vio antes.
      const r = winsiStore.resolveJid(p.id)?.jid
      if (esNumero(r)) numero = r!
    }
    if (numero && !ids.includes(numero)) ids.push(numero)
    return { id: p.id, ids, numero, admin: p.admin === 'admin' || p.admin === 'superadmin' }
  })
}

/** El bot en este grupo, por cualquiera de sus formas. */
export function esElBot(sock: WASocket, m: Miembro): boolean {
  const yo = sock.user?.id ?? ''
  const num = yo.split(':')[0] + '@s.whatsapp.net'
  const lid = (sock.user as any)?.lid as string | undefined
  return m.ids.some(i => i === yo || i === num || (lid && i.split(':')[0] === lid.split(':')[0]))
}

/**
 * El número de teléfono de quien mandó `msg` (para deducir su país, y con él
 * su idioma). Con un @lid no está en el jid: WhatsApp a veces lo manda aparte
 * en la clave del mensaje, y si no, el store puede conocerlo. '' si no.
 */
export function numeroDe(sender: string, msg: WAMessage, isGroup: boolean): string {
  if (esNumero(sender)) return sender
  const pn = (isGroup ? msg.key.participantPn : msg.key.senderPn) ?? ''
  if (pn) return pn
  const r = sender ? winsiStore.resolveJid(sender).jid : ''
  return esNumero(r) ? r : ''
}
