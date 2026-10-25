// La forja: mejorar el arma de +0 a +10. Lógica pura, sin estado ni WhatsApp;
// la usa #forjar y se prueba desde scripts/forge.test.js.
//
// Para qué: las espadas ⚔️, los ✨ sp y los 🏆 legendarios se ganaban con
// daily/weekly/monthly/mine/chest y NADA los consumía; solo se veían en #xp.
// La forja los gasta, y el arma le da daño al jefe de mundo (#raid).
//
// Cada +1 cuesta más y sale menos. Fallar hasta +3 solo pierde los
// materiales; desde +4, además baja un nivel, salvo que se tenga una 🛡️
// piedra de protección (el campo `spada`, que existía y nadie entregaba).
// Nunca se rompe el arma: perder todo de un golpe es frustración, no juego.

export const MAX_NIVEL = 10

/** % de éxito para pasar de `nivel` a `nivel + 1`. */
const EXITO = [100, 95, 90, 80, 70, 60, 50, 40, 30, 20]

export interface Costo { espadas: number; sp: number; legendarios: number; dinero: number }

export function costo(nivel: number): Costo {
  return {
    espadas:     1 + Math.floor(nivel / 2),
    sp:          2 + nivel,
    legendarios: nivel >= 6 ? 1 : 0,
    dinero:      1000 * (nivel + 1) ** 2,
  }
}

export const probabilidad = (nivel: number) => EXITO[nivel] ?? 0

/** Desde este nivel, fallar baja uno. */
export const NIVEL_RIESGO = 4

export const COSTO_PROTECCION: Costo = { espadas: 4, sp: 0, legendarios: 1, dinero: 5000 }

export interface Intento { exito: boolean; nivel: number; usoProteccion: boolean }

/** `azar()` da un número en [0, 1). */
export function intentar(nivel: number, tieneProteccion: boolean, azar: () => number = Math.random): Intento {
  if (nivel >= MAX_NIVEL) return { exito: false, nivel, usoProteccion: false }
  if (azar() * 100 < probabilidad(nivel)) return { exito: true, nivel: nivel + 1, usoProteccion: false }
  if (nivel < NIVEL_RIESGO) return { exito: false, nivel, usoProteccion: false }
  if (tieneProteccion) return { exito: false, nivel, usoProteccion: true }
  return { exito: false, nivel: nivel - 1, usoProteccion: false }
}

/** Multiplicador de daño en el raid: +8% por nivel. */
export const bonoArma = (nivel: number) => 1 + 0.08 * Math.min(Math.max(nivel, 0), MAX_NIVEL)

export interface Inventario { sword: number; sp: number; legendary: number }

/** Lo que falta para pagar `c`, o lista vacía si alcanza. */
export function faltante(c: Costo, inv: Inventario, dinero: number): string[] {
  const f: string[] = []
  if (inv.sword < c.espadas) f.push(`${c.espadas - inv.sword} ⚔️`)
  if (inv.sp < c.sp) f.push(`${c.sp - inv.sp} ✨`)
  if (inv.legendary < c.legendarios) f.push(`${c.legendarios - inv.legendary} 🏆`)
  if (dinero < c.dinero) f.push(`¥${(c.dinero - dinero).toLocaleString()}`)
  return f
}
