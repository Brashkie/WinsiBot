// La protección de canales (#canal): si cambian el nombre o la descripción de
// un canal protegido, se restauran y se les avisa a los dueños del bot.
//
// WhatsApp no dice quién hizo el cambio, así que no hay a quién degradar (ver
// lib/channelGuard.ts). Para restaurar, el bot tiene que ser dueño o admin
// del canal; si no lo es, solo avisa. Corre solo ante un cambio de un canal:
// un mensaje normal no paga nada.

import type { WASocket } from '@whiskeysockets/baileys'
import { config } from '@config'
import { logger } from '@core/logger.js'
import { aRestaurar, leerCambio } from '@lib/channelGuard.js'
import { getGroupConfig } from './index.js'

export async function vigilarCanal(sock: WASocket, id: string, update: unknown): Promise<void> {
  const cfg = getGroupConfig(id)
  if (!cfg.antirrobo || !cfg.canal) return
  const cambio = leerCambio(update)
  const restaurar = aRestaurar(cfg.canal, cambio)
  if (!restaurar) return
  logger.warn({ id, cambio }, '[canal] cambio en un canal protegido')

  const hecho: string[] = []
  const fallo: string[] = []
  if (restaurar.nombre !== undefined) {
    await sock.newsletterUpdateName(id, restaurar.nombre).then(
      () => hecho.push('el nombre'),
      (err) => { fallo.push('el nombre'); logger.warn({ err, id }, '[canal] no se pudo restaurar el nombre') },
    )
  }
  if (restaurar.descripcion !== undefined) {
    await sock.newsletterUpdateDescription(id, restaurar.descripcion).then(
      () => hecho.push('la descripción'),
      (err) => { fallo.push('la descripción'); logger.warn({ err, id }, '[canal] no se pudo restaurar la descripción') },
    )
  }

  const texto = [
    '🛡 *Canal protegido*',
    `Cambiaron ${[cambio.nombre !== undefined ? `el nombre a «${cambio.nombre}»` : '', cambio.descripcion !== undefined ? 'la descripción' : ''].filter(Boolean).join(' y ')} de *${cfg.canal.nombre}*.`,
    ...(hecho.length ? [`§ Restauré ${hecho.join(' y ')}.`] : []),
    ...(fallo.length ? [`§ No pude restaurar ${fallo.join(' ni ')}: ¿soy admin del canal?`] : []),
    `§ Si el cambio era tuyo: #canal actualizar ${id}`,
  ].join('\n')
  for (const o of config.ownerJid) {
    if (o.endsWith('@lid')) continue
    const jid = o.includes('@') ? o : `${o.replace(/\D/g, '')}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: texto }).catch(() => {})
  }
}
