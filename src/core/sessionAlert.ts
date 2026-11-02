// Avisar cuando WhatsApp sacó a la sesión del bot.
//
// Un 440 (connectionReplaced) es que OTRA conexión entró con las mismas
// credenciales: o hay dos copias del bot corriendo, o alguien copió la carpeta
// de la sesión y la está usando. Hasta la 9.2 solo quedaba una línea en el log
// —que además decía "cierra WhatsApp Web", y WhatsApp Web es otro dispositivo,
// con sus propias credenciales—. Un 401 (loggedOut) es que el dispositivo se
// desvinculó.
//
// En ese momento el bot ya no está conectado y no puede escribirle a nadie, y
// enseguida se cierra. Así que se anota en disco, de forma síncrona para que
// el exit no lo corte, y en la próxima conexión se les avisa a los dueños por
// privado. No cuesta nada mientras no pase.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { WASocket } from '@whiskeysockets/baileys'
import { config } from '@config'
import { logger } from '@core/logger.js'

// La ruta se puede cambiar para los tests: que nunca toquen la nota de verdad.
const ARCHIVO = process.env.WINSI_SESSION_ALERT_FILE ?? './data/security/session-closed.json'

interface Expulsion {
  code: number
  at: number
}

export function anotarExpulsion(code: number): void {
  try {
    mkdirSync(dirname(ARCHIVO), { recursive: true })
    writeFileSync(ARCHIVO, JSON.stringify({ code, at: Date.now() } satisfies Expulsion))
  } catch (err) {
    logger.warn({ err }, '[seguridad] no se pudo anotar el cierre de sesión')
  }
}

export function textoDeExpulsion(e: Expulsion): string {
  const cuando = new Date(e.at).toLocaleString('es')
  if (e.code === 440) {
    return [
      '⚠️ *Alerta de seguridad*',
      `El ${cuando} otra conexión entró con las *mismas credenciales* del bot y lo desconectó.`,
      '',
      'Si no tenías otra copia del bot corriendo, alguien puede tener los archivos de la sesión:',
      '§ En el teléfono del bot, *Dispositivos vinculados*: cierra todas las sesiones',
      '§ Borra la carpeta de la sesión, vuelve a escanear el QR y cambia el acceso a la máquina',
    ].join('\n')
  }
  return [
    '⚠️ *Aviso de sesión*',
    `El ${cuando} WhatsApp cerró la sesión del bot: el dispositivo se desvinculó.`,
    'Si no lo hiciste tú, revisa *Dispositivos vinculados* en el teléfono del bot.',
  ].join('\n')
}

/** Si hubo un cierre anotado, se avisa a los dueños y se borra la nota. */
export async function avisarSiHubo(sock: WASocket): Promise<void> {
  let e: Expulsion
  try {
    e = JSON.parse(readFileSync(ARCHIVO, 'utf8')) as Expulsion
  } catch {
    return
  }
  const texto = textoDeExpulsion(e)
  for (const o of config.ownerJid) {
    if (o.endsWith('@lid')) continue
    const jid = o.includes('@') ? o : `${o.replace(/\D/g, '')}@s.whatsapp.net`
    await sock.sendMessage(jid, { text: texto }).catch(() => {})
  }
  try {
    rmSync(ARCHIVO)
  } catch {}
}
