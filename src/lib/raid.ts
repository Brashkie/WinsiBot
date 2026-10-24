// Raids contra un jefe de mundo: las cuentas, sin estado ni WhatsApp. El jefe
// y su temporizador viven en raidWorld.ts; esto se prueba directo desde
// scripts/raid.test.js.

export interface DefJefe {
  id:      string
  nombre:  string
  emoji:   string
  hpBase:  number
  frases:  string[]   // lo que se ve al golpearlo
}

export const JEFES: DefJefe[] = [
  { id: 'kraken',  nombre: 'Kraken Abisal',      emoji: '🐙', hpBase: 6_000,
    frases: ['agita sus tentáculos', 'escupe tinta', 'ruge desde el fondo'] },
  { id: 'golem',   nombre: 'Gólem de Obsidiana', emoji: '🗿', hpBase: 8_000,
    frases: ['se agrieta', 'retumba', 'lanza esquirlas'] },
  { id: 'fenix',   nombre: 'Fénix Corrupto',     emoji: '🔥', hpBase: 5_000,
    frases: ['arde con más fuerza', 'chilla', 'suelta plumas en llamas'] },
  { id: 'hidra',   nombre: 'Hidra de Tres Cabezas', emoji: '🐉', hpBase: 9_000,
    frases: ['muerde el aire', 'sisea', 'le crece otra cabeza… y se cae'] },
  { id: 'liche',   nombre: 'Rey Liche',          emoji: '💀', hpBase: 7_000,
    frases: ['invoca huesos', 'se ríe', 'lanza un rayo helado'] },
]

/**
 * La vida del jefe: la base, más la mitad por cada participante del raid
 * anterior. Así un grupo de 3 y una comunidad de 40 tienen los dos un jefe que
 * cuesta, sin que nadie configure nada. Con tope, para que un raid enorme no
 * deje uno imposible para el siguiente.
 */
export function vidaJefe(def: DefJefe, participantesAnterior: number): number {
  const n = Math.min(Math.max(participantesAnterior, 0), 40)
  return Math.round(def.hpBase * (1 + 0.5 * n))
}

/**
 * Lo que pega un ataque. Sube con el nivel y con el mejor dragón (#pet), se
 * multiplica por el arma (#forjar, ver bonoArma en forja.ts), con un ±25% de
 * azar y un 10% de crítico x2. `azar()` da un número en [0, 1).
 */
export function danio(
  nivel: number,
  nivelDragon: number,
  azar: () => number = Math.random,
  bonoArma = 1,
): { danio: number; critico: boolean } {
  const base = (40 + 6 * Math.max(nivel, 0) + 4 * Math.max(nivelDragon, 0)) * bonoArma
  const variacion = 0.75 + azar() * 0.5
  const critico = azar() < 0.1
  return { danio: Math.max(1, Math.round(base * variacion * (critico ? 2 : 1))), critico }
}

export interface Premio { jid: string; dinero: number; exp: number; mvp: boolean; remate: boolean }

/**
 * Reparte el botín por el daño de cada uno. El que más pegó (MVP) y el que lo
 * remató se llevan un 20% y un 10% extra de su parte. `fraccion` es 1 si el jefe
 * cayó, y menos si se escapó (premio de consolación).
 */
export function repartir(
  danios: Record<string, number>,
  vidaMax: number,
  remate: string | null,
  fraccion = 1,
): Premio[] {
  const total = Object.values(danios).reduce((a, b) => a + b, 0)
  if (total <= 0) return []
  // Calibrado contra #work (~¥900 y ~125 exp cada 10 min): uno solo a nivel 10
  // tumba al jefe más chico en ~1 h y se lleva ~¥11.700 y ~1.170 exp —un
  // poco más del doble que trabajar esa hora, por ser un evento cada 6 h—. En
  // grupo, la vida crece con la gente y cada parte queda cerca de una hora de
  // #work.
  const bolsaDinero = vidaMax * 1.5 * fraccion
  const bolsaExp    = vidaMax * 0.15 * fraccion

  let mvp = ''
  let max = -1
  // Desempate estable: a igual daño, el primero en orden de jid.
  for (const jid of Object.keys(danios).sort()) {
    if (danios[jid]! > max) { max = danios[jid]!; mvp = jid }
  }

  return Object.entries(danios)
    .map(([jid, d]) => {
      const parte = d / total
      const extra = 1 + (jid === mvp ? 0.2 : 0) + (jid === remate ? 0.1 : 0)
      return {
        jid,
        dinero: Math.round(bolsaDinero * parte * extra),
        exp:    Math.round(bolsaExp * parte * extra),
        mvp:    jid === mvp,
        remate: jid === remate,
      }
    })
    .sort((a, b) => b.dinero - a.dinero)
}

// ─── Sinergia elemental ───────────────────────────────────────────────────────
// Dos jugadores DISTINTOS que golpean seguido —dentro de VENTANA_REACCION—
// con compañeros de elementos que combinan disparan una reacción: el segundo
// golpe pega más. Premia coordinarse en el grupo y le da sentido a qué dragón
// llevas. Los elementos son los 21 del catálogo de Dragon City; casi todos los
// dragones tienen cuatro, así que se elige la mejor combinación entre los dos.

export const VENTANA_REACCION = 90_000

export const ELEMENTO: Record<string, string> = {
  Flame: '🔥 Fuego', Ice: '❄️ Hielo', Wind: '🌪️ Viento', Sea: '🌊 Mar', Terra: '⛰️ Tierra',
  Electric: '⚡ Eléctrico', Nature: '🌿 Naturaleza', Light: '☀️ Luz', Dark: '🌑 Oscuridad',
  Metal: '⚙️ Metal', War: '⚔️ Guerra', Time: '⏳ Tiempo', Chaos: '🌀 Caos', Dream: '💤 Sueño',
  Soul: '👻 Alma', Magic: '🔮 Magia', Pure: '🕊️ Puro', Primal: '🦴 Primigenio',
  Legend: '👑 Leyenda', Happy: '😄 Alegría', Beauty: '🌸 Belleza',
}

export interface Reaccion { nombre: string; mult: number; elementos: [string, string] }

const REACCIONES: Array<[string, string, string, number]> = [
  ['Light', 'Dark', 'Eclipse', 1.8],
  ['Time', 'Chaos', 'Paradoja', 1.7],
  ['Primal', 'Legend', 'Despertar ancestral', 1.7],
  ['Flame', 'Wind', 'Tormenta de fuego', 1.6],
  ['Sea', 'Electric', 'Electrocución', 1.6],
  ['Nature', 'Flame', 'Incendio forestal', 1.5],
  ['Metal', 'Electric', 'Sobrecarga', 1.5],
  ['Dream', 'Soul', 'Pesadilla', 1.5],
  ['Wind', 'Sea', 'Huracán', 1.5],
  ['Magic', 'Pure', 'Arcano puro', 1.5],
  ['Flame', 'Ice', 'Vapor', 1.4],
  ['Ice', 'Sea', 'Congelación', 1.4],
  ['War', 'Metal', 'Forja de guerra', 1.4],
  ['Terra', 'Sea', 'Lodazal', 1.3],
  ['Happy', 'Beauty', 'Encanto', 1.3],
]

/** La mejor reacción entre los elementos de dos golpes, o null si no combinan. */
export function reaccion(a: string[], b: string[]): Reaccion | null {
  let mejor: Reaccion | null = null
  for (const [x, y, nombre, mult] of REACCIONES) {
    const par: [string, string] | null =
      a.includes(x) && b.includes(y) ? [x, y] : a.includes(y) && b.includes(x) ? [y, x] : null
    if (par && (!mejor || mult > mejor.mult)) mejor = { nombre, mult, elementos: par }
  }
  return mejor
}

/** "▰▰▰▰▱▱▱▱▱▱" */
export function barra(actual: number, max: number, largo = 10): string {
  const llenos = max > 0 ? Math.round((Math.max(actual, 0) / max) * largo) : 0
  return '▰'.repeat(llenos) + '▱'.repeat(largo - llenos)
}
