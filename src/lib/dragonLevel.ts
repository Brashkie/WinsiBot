// Nivel, experiencia y etapas de los dragones (#pet). Lógica pura: la usan
// #pet al alimentar y companion.ts al ganar experiencia con la actividad del
// chat, y se prueba desde scripts/companion.test.js. Vivía repartida entre
// dragoncity.ts (que carga axios y ffmpeg) y una copia privada en pet.ts.

import type { OwnedDragon } from '@core/events.js'

// Curva lineal, no exponencial (a diferencia del sistema de mascotas viejo):
// con evolución final en nivel 25, una curva 1.4^nivel pediría decenas de
// miles de alimentadas para llegar — esta pide ~440, alcanzable en unos
// días de juego normal dado el ritmo de acumulación de Oro.
export function expForLevel(level: number): number {
  return 50 + level * 40
}

// La etapa 0 (huevo) NUNCA es el estado de un dragón ya obtenido — es solo el
// visual previo a nacer. Un dragón recién nacido ya arranca en etapa 1;
// evoluciona a la etapa 3 (final) en STAGE3_LEVEL.
export const STAGE3_LEVEL = 25

export function stageForLevel(level: number): 1 | 3 {
  return level >= STAGE3_LEVEL ? 3 : 1
}

/**
 * Le suma `exp` al dragón y lo sube de nivel lo que alcance. Con `tope`, no
 * pasa de ese nivel: la experiencia de más se pierde.
 */
export function aplicarExp(
  dragon: OwnedDragon,
  exp: number,
  tope = Infinity,
): { leveled: boolean; evolvedToFinal: boolean } {
  const oldLevel  = dragon.level
  const wasStage3 = dragon.stage === 3
  dragon.exp += exp
  while (dragon.level < tope && dragon.exp >= expForLevel(dragon.level)) {
    dragon.exp -= expForLevel(dragon.level)
    dragon.level++
  }
  if (dragon.level >= tope) dragon.exp = Math.min(dragon.exp, expForLevel(dragon.level) - 1)
  dragon.stage = stageForLevel(dragon.level)
  return { leveled: dragon.level > oldLevel, evolvedToFinal: !wasStage3 && dragon.stage === 3 }
}
