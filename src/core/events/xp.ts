import { getUserData, userData, expForLevel } from './index.js'

const XP_PER_MSG = () => Math.ceil(Math.random() * 10) + 5

/** Suma XP pasiva por cada mensaje. NO sube de nivel ni avisa nada acá —
 *  eso corre centralizado en handler.ts (`checkLevelUp` + chequeo de
 *  `autolevelup`), justo después de llamar a esto, con la fórmula "oficial"
 *  de `expForLevel` en events/index.ts.
 *
 *  Antes esta función subía de nivel y avisaba por su cuenta, con su PROPIA
 *  fórmula (100 * 1.5^nivel — la misma que ya se había reemplazado en el
 *  resto del bot por volverse matemáticamente imposible pasado el nivel
 *  ~22) y sin chequear el toggle de `autolevelup` en absoluto. Como nadie
 *  tenía este archivo en el radar, nunca pasó por la auditoría que sí
 *  arregló work/crime/mine/daily/weekly/monthly/chest y el chequeo
 *  centralizado — coincide exactamente con "desactivé el nivel y sigue
 *  apareciendo": esta era la única ruta que de verdad lo ignoraba. */
export function addXP(sender: string, pushName: string): void {
  const user  = getUserData(sender, pushName)
  user.exp   += XP_PER_MSG()
  user.name   = pushName || user.name
  userData.set(sender, user)
}

export function getXPInfo(sender: string): { exp: number; level: number; needed: number; progress: number } {
  const user   = getUserData(sender)
  const needed = expForLevel(user.level)
  const pct    = Math.floor((user.exp / needed) * 100)
  return { exp: user.exp, level: user.level, needed, progress: pct }
}