// La mazmorra del día: el mapa y las reglas, sin estado ni WhatsApp. La usan
// expeditions.ts y #mazmorra, y se prueba desde scripts/dungeon.test.js.
//
// El mapa sale de una semilla que es la FECHA (UTC): todos los grupos
// recorren la misma mazmorra ese día, y se puede comparar quién llegó más
// hondo. Son NIVELES niveles con 2 o 3 puertas cada uno y un jefe al final;
// detrás de cada puerta hay un monstruo, una trampa, un tesoro, una fuente o
// nada, y lo único que se ve es una PISTA. Las pistas se repiten entre tipos a
// propósito: "huele a azufre" puede ser un monstruo o una trampa. Elegir es
// apostar.
//
// No hace falta Rust ni BSP para esto: son 25 salas, y generarlas con la
// semilla tarda microsegundos.

export const NIVELES  = 10
export const VIDA_MAX = 100
/** Si el grupo cae, se queda con esto del botín. */
export const SI_CAEN  = 0.25
/** Llegar al final y tumbar al jefe multiplica el botín. */
export const POR_TERMINAR = 1.5

export type Tipo = 'monstruo' | 'trampa' | 'tesoro' | 'fuente' | 'vacia' | 'jefe'

export interface Sala {
  tipo:    Tipo
  pista:   string
  nombre?: string   // del monstruo o el jefe
  fuerza:  number   // monstruo/jefe: cuánto pega; trampa: cuánto quita; tesoro: cuánto vale
  objeto?: 'sword' | 'sp' | 'legendary'
}

export interface Mazmorra { dia: string; niveles: Sala[][] }

// ─── Azar con semilla ─────────────────────────────────────────────────────────

/** mulberry32: chico, rápido y reproducible. Da números en [0, 1). */
export function azarDe(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function semillaDe(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const diaDe = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// ─── El mapa ──────────────────────────────────────────────────────────────────

const PISTAS: Record<Exclude<Tipo, 'jefe'>, string[]> = {
  monstruo: ['Se oyen gruñidos', 'Huele a azufre', 'Hay huesos en el umbral', 'Algo respira del otro lado'],
  trampa:   ['El suelo cruje', 'Huele a azufre', 'Hay un silencio raro', 'Las paredes tienen marcas'],
  tesoro:   ['Algo brilla', 'Hay un silencio raro', 'Las paredes tienen marcas'],
  fuente:   ['Se oye agua', 'Algo brilla', 'Corre una brisa fresca'],
  vacia:    ['Corre una brisa fresca', 'Se oye agua', 'Hay un silencio raro'],
}

const MONSTRUOS = ['Esqueleto', 'Goblin', 'Araña gigante', 'Lobo sombrío', 'Gólem de barro', 'Murciélago vampiro', 'Ogro', 'Espectro', 'Basilisco']
const JEFES     = ['Dracoliche', 'Rey Goblin', 'Señor de las Arañas', 'Minotauro', 'Hechicera Oscura']

function elegir<T>(az: () => number, xs: readonly T[]): T {
  return xs[Math.floor(az() * xs.length)]!
}

function tipoAl(az: () => number): Exclude<Tipo, 'jefe'> {
  const r = az()
  if (r < 0.40) return 'monstruo'
  if (r < 0.60) return 'trampa'
  if (r < 0.80) return 'tesoro'
  if (r < 0.90) return 'fuente'
  return 'vacia'
}

export function generar(dia: string): Mazmorra {
  const az = azarDe(semillaDe(`winsi-mazmorra-${dia}`))
  const niveles: Sala[][] = []
  for (let n = 1; n <= NIVELES; n++) {
    if (n === NIVELES) {
      niveles.push([{
        tipo: 'jefe', pista: 'Una puerta enorme, cerrada con cadenas',
        nombre: elegir(az, JEFES), fuerza: Math.round(200 + az() * 50),
      }])
      continue
    }
    const puertas = 2 + Math.floor(az() * 2)
    const nivel: Sala[] = []
    for (let p = 0; p < puertas; p++) {
      const tipo = tipoAl(az)
      const pista = elegir(az, PISTAS[tipo])
      const varia = 0.8 + az() * 0.4
      if (tipo === 'monstruo') {
        nivel.push({ tipo, pista, nombre: elegir(az, MONSTRUOS), fuerza: Math.round((30 + 15 * n) * varia) })
      } else if (tipo === 'trampa') {
        nivel.push({ tipo, pista, fuerza: Math.round((5 + 2 * n) * varia) })
      } else if (tipo === 'tesoro') {
        const r = az()
        const objeto = n >= 7 && r < 0.15 ? 'legendary' : r < 0.45 ? 'sword' : r < 0.75 ? 'sp' : undefined
        nivel.push({ tipo, pista, fuerza: Math.round((800 + 400 * n) * varia), ...(objeto ? { objeto } : {}) })
      } else {
        nivel.push({ tipo, pista, fuerza: tipo === 'fuente' ? 25 : 0 })
      }
    }
    niveles.push(nivel)
  }
  return { dia, niveles }
}

// ─── Entrar a una sala ────────────────────────────────────────────────────────

/** El poder de UN aventurero: nivel, compañero (#pet) y arma (#forjar). */
export function poderDe(nivel: number, nivelCompanero: number, bonoArma: number): number {
  return Math.round((20 + 3 * Math.max(nivel, 0) + 2 * Math.max(nivelCompanero, 0)) * bonoArma)
}

export interface Resultado {
  vida:    number   // la del grupo después
  botin:   number   // lo que se suma al botín
  objeto?: Sala['objeto']
  texto:   string
}

/**
 * Lo que pasa al entrar. Los monstruos siempre caen: lo que cuesta es VIDA,
 * y cuesta menos cuanto más poder tiene el grupo (fuerza² / (poder + fuerza)).
 * La vida es lo que se apuesta al seguir bajando.
 */
export function entrar(sala: Sala, poder: number, vida: number, az: () => number = Math.random): Resultado {
  const varia = 0.8 + az() * 0.4
  switch (sala.tipo) {
    case 'monstruo':
    case 'jefe': {
      const f = sala.fuerza
      const pierde = Math.max(1, Math.round(((f * f) / (Math.max(poder, 1) + f)) * 0.4 * varia))
      const nueva = Math.max(0, vida - pierde)
      const botin = nueva > 0 ? f * 20 : 0
      return {
        vida: nueva, botin,
        texto: nueva > 0
          ? `⚔️ *${sala.nombre}* (fuerza ${f}) cae. El grupo pierde ${pierde} de vida.`
          : `💀 *${sala.nombre}* (fuerza ${f}) es demasiado: el grupo cae.`,
      }
    }
    case 'trampa': {
      const pierde = Math.round(sala.fuerza * varia)
      const nueva = Math.max(0, vida - pierde)
      return { vida: nueva, botin: 0, texto: nueva > 0 ? `🪤 ¡Una trampa! −${pierde} de vida.` : `🪤 Una trampa termina con el grupo.` }
    }
    case 'tesoro':
      return {
        vida, botin: sala.fuerza, objeto: sala.objeto,
        texto: `💰 ¡Un tesoro! +¥${sala.fuerza.toLocaleString()}${sala.objeto ? ` y ${OBJETO[sala.objeto]}` : ''}.`,
      }
    case 'fuente': {
      const nueva = Math.min(VIDA_MAX, vida + sala.fuerza)
      return { vida: nueva, botin: 0, texto: `⛲ Una fuente: +${nueva - vida} de vida.` }
    }
    default:
      return { vida, botin: 0, texto: `🕸️ Nada. Solo polvo.` }
  }
}

export const OBJETO = { sword: '1 ⚔️', sp: '2 ✨', legendary: '1 🏆' } as const

/** El botín crece con la gente: +25% por aventurero extra, hasta 8. Sin esto,
 *  repartir haría que jugar solo rinda más que en grupo (medido: uno fuerte
 *  solo se llevaba el doble por cabeza que cuatro fuertes juntos). */
export const bonoGrupo = (participantes: number) => 1 + 0.25 * (Math.min(Math.max(participantes, 1), 8) - 1)

/** Lo que se lleva cada uno al terminar: el botín, en partes iguales. */
export function cobrar(botin: number, participantes: number, como: 'retirada' | 'terminada' | 'caida'): number {
  if (participantes <= 0) return 0
  const mult = como === 'terminada' ? POR_TERMINAR : como === 'caida' ? SI_CAEN : 1
  return Math.floor((botin * mult * bonoGrupo(participantes)) / participantes)
}
