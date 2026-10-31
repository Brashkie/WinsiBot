// El antirrobo de grupos (#antirrobo): cuando alguien degrada o saca a un admin
// protegido, o al bot, se degrada al autor, se le devuelve el lugar al
// afectado, se revoca el enlace y se le avisa a los protegidos por privado.
//
// Quién es atacante y qué hacer no se decide acá: lo decide la Session API con
// la función de Ada/SPARK cuyas garantías demuestra GNATprove (ver
// crates/session-api/ada/src/group_guard.ads). Este archivo solo describe el
// evento y ejecuta la respuesta.
//
// Solo corre ante un admin degradado o expulsado en un grupo con el antirrobo
// activo: ni un mensaje normal ni un grupo sin él pagan nada.

import { config as botConfig } from '@config'
import { getGroupMetadata } from '@core/groupCache.js'
import { logger } from '@core/logger.js'
import {
  AVISAR_DUENO,
  aliasDe,
  banderas,
  DEGRADAR_AUTOR,
  esLaMisma,
  type Participante,
  RESTAURAR_AFECTADO,
  REVOCAR_ENLACE,
  tipoDe,
} from '@lib/groupGuard.js'
import { rustHttp } from '@lib/rustHttp.js'
import type { WASocket } from '@whiskeysockets/baileys'
import { type GroupConfig, getGroupConfig } from './index.js'

/** El bot, con su número y su @lid. */
export function aliasDelBot(sock: WASocket): string[] {
  return [sock.user?.id, (sock.user as { lid?: string } | undefined)?.lid].filter(
    (x): x is string => !!x,
  )
}

/** Los que el antirrobo protege: los marcados, el creador del grupo y los dueños del bot. */
export function protegidosDe(cfg: GroupConfig, owner: string | undefined): string[] {
  const duenos = botConfig.ownerJid.map((o) =>
    o.includes('@') ? o : `${o.replace(/\D/g, '')}@s.whatsapp.net`,
  )
  return [...cfg.protegidos, ...(owner ? [owner] : []), ...duenos]
}

/** Quién puede tocar el antirrobo: un protegido. Si no, el atacante lo apaga primero. */
export async function esGuardian(
  sock: WASocket,
  jid: string,
  sender: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true
  const meta = await getGroupMetadata(sock, jid)
  const participantes = (meta?.participants ?? []) as Participante[]
  return protegidosDe(getGroupConfig(jid), meta?.owner).some((p) =>
    esLaMisma(p, sender, participantes),
  )
}

/** El alias con número de teléfono, que es al que se le puede escribir por privado. */
function privadoDe(jid: string, participantes: readonly Participante[]): string | undefined {
  return aliasDe(jid, participantes).find((a) => a.endsWith('@s.whatsapp.net'))
}

const arroba = (jid: string) => `@${jid.split('@')[0]}`

export async function vigilar(
  sock: WASocket,
  id: string,
  autor: string | undefined,
  afectados: readonly string[],
  action: string,
): Promise<void> {
  const cfg = getGroupConfig(id)
  if (!cfg.antirrobo) return
  const tipo = tipoDe(action)
  if (tipo < 1) return

  const meta = await getGroupMetadata(sock, id)
  const participantes = (meta?.participants ?? []) as Participante[]
  const bot = aliasDelBot(sock)
  const protegidos = protegidosDe(cfg, meta?.owner)
  const botP = meta?.participants.find((p) => bot.some((b) => esLaMisma(b, p.id, participantes)))
  // Si el evento le quitó el admin al bot, la caché todavía no lo sabe.
  const tocaAlBot = afectados.some((a) => bot.some((b) => esLaMisma(b, a, participantes)))
  const botEsAdmin = !!botP?.admin && !tocaAlBot

  let todas = 0
  const restaurar: string[] = []
  for (const afectado of afectados) {
    const f = banderas(
      { activo: true, autor, afectado, protegidos, bot, botEsAdmin },
      participantes,
    )
    let acciones = 0
    try {
      const r = await rustHttp.post<{ acciones: number }>(
        '/group/guard/decide',
        { tipo, banderas: f },
        { timeout: 5_000 },
      )
      acciones = r.data.acciones
    } catch (err) {
      // Sin la decisión no se actúa contra nadie: es el lado seguro.
      logger.warn({ err, id }, '[antirrobo] la Session API no respondió; no se hace nada')
      return
    }
    todas |= acciones
    if (acciones & RESTAURAR_AFECTADO) restaurar.push(afectado)
  }
  if (!todas) return
  logger.warn({ id, autor, afectados, action, acciones: todas }, '[antirrobo] ataque detectado')

  // Primero cortarle el admin al autor, antes de que siga.
  const hecho: string[] = []
  if (todas & DEGRADAR_AUTOR && autor) {
    await sock.groupParticipantsUpdate(id, [autor], 'demote').then(
      () => hecho.push(`se le quitó el admin a ${arroba(autor)}`),
      (err) => logger.warn({ err, id }, '[antirrobo] no se pudo degradar al autor'),
    )
  }
  if (restaurar.length) {
    await sock.groupParticipantsUpdate(id, restaurar, tipo === 1 ? 'promote' : 'add').then(
      () => hecho.push(tipo === 1 ? 'se devolvió el admin' : 'se volvió a agregar al grupo'),
      (err) => logger.warn({ err, id }, '[antirrobo] no se pudo restaurar al afectado'),
    )
  }
  if (todas & REVOCAR_ENLACE) {
    await sock.groupRevokeInvite(id).then(
      () => hecho.push('se revocó el enlace del grupo'),
      (err) => logger.warn({ err, id }, '[antirrobo] no se pudo revocar el enlace'),
    )
  }

  const quien = autor ? arroba(autor) : 'alguien'
  const que = tipo === 1 ? 'le quitó el admin a' : 'sacó del grupo a'
  const resumen = [
    `🛡 *Antirrobo*`,
    `${quien} ${que} ${afectados.map(arroba).join(', ')}.`,
    hecho.length ? `§ ${hecho.join('; ')}.` : '§ No soy admin del grupo: no pude revertirlo.',
  ].join('\n')
  const menciones = [...(autor ? [autor] : []), ...afectados]

  if (botEsAdmin) {
    await sock.sendMessage(id, { text: resumen, mentions: menciones }).catch(() => {})
  }
  if (todas & AVISAR_DUENO) {
    const avisar = new Set<string>()
    for (const p of protegidos) {
      if (bot.some((b) => esLaMisma(b, p, participantes)) || esLaMisma(p, autor, participantes))
        continue
      const pv = privadoDe(p, participantes)
      if (pv) avisar.add(pv)
    }
    const texto = `${resumen}\n§ Grupo: *${meta?.subject ?? id}*`
    for (const pv of avisar) {
      await sock.sendMessage(pv, { text: texto, mentions: menciones }).catch(() => {})
    }
  }
}
