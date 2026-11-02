// La IA ayuda con los comandos: si alguien le pregunta cómo hacer algo con el
// bot, se buscan los comandos que sirven y se los pasa junto a su mensaje.
//
// Hasta la 9.2 la Session API tenía su propio catálogo de 28 comandos —el bot
// tiene más de 250— y lo metía en el *system* casi en cada mensaje: detectaba
// "pregunta por comandos" con palabras como "que", "es" o "para". Ahora la
// fuente es el registro real de comandos, con sus descripciones en los tres
// idiomas, y solo se busca cuando de verdad preguntan por el bot.
//
// No cuesta nada en un mensaje normal: el índice se arma la primera vez que
// alguien pregunta, y buscar en él son unos microsegundos.
//
// Sin alias de importación, para poder probarlo.

import type { Idioma } from './i18n.js'

export interface ComandoInfo {
  name: string
  aliases?: string[] | undefined
  description: string
  category: string
}

/** Lo que nunca se le sugiere a nadie desde la IA. */
const FUERA = new Set(['owner', 'nsfw'])

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const normalizar = (s: string) => quitarTildes(s.toLowerCase())

/** Palabras que no dicen nada de qué comando se busca. */
const VACIAS = new Set(
  (
    'que como para por con una uno unos unas los las del el la al de en es son hay mas pero porque cuando donde ' +
    'quien cual cuales este esta esto eso esa ese mis tus sus nos les algo alguien puedo puede puedes hago hace ' +
    'hacer usar uso sirve sirven bot comando comandos favor ayuda ayudame dime quiero necesito tengo tiene ' +
    'how what which can the and for with this that does use command commands help want need please ' +
    'voce vc pra com uma faco faz fazer usar ajuda quero preciso tem'
  ).split(' '),
)

export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length >= 3 && !VACIAS.has(p))
}

/**
 * Cómo lo dice la gente → cómo lo dicen las descripciones. Pocas y a mano:
 * solo donde la palabra de todos los días no aparece en ninguna descripción.
 */
const SINONIMOS: Record<string, string[]> = {
  musica: ['cancion', 'audio'],
  music: ['song', 'audio'],
  dinero: ['monedas', 'coins', 'balance'],
  plata: ['monedas', 'coins', 'balance'],
  money: ['coins', 'balance'],
  foto: ['imagen'],
  photo: ['image'],
  figurinha: ['sticker'],
}

const conSinonimos = (ps: string[]) => [...new Set(ps.flatMap((p) => [p, ...(SINONIMOS[p] ?? [])]))]

/**
 * La raíz cruda, de 4 a 6 letras: "descargo" y "descarga" → "descar",
 * "quito" y "quita" → "quit". Dos raíces coinciden si una es el comienzo de
 * la otra: "perf" (de "perfil") y "perfil" (de "perfiles").
 */
const raiz = (p: string) => p.slice(0, Math.min(6, Math.max(4, p.length - 2)))
// Las dos de 4 letras o más: un comando que se llama `c` no es "el comienzo"
// de todo lo que empieza con c.
const coinciden = (a: string, b: string) => a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))

/**
 * ¿Pregunta por el bot? Tiene que pedirlo de verdad: "cómo hago…", "hay un
 * comando…", "para qué sirve…", "how do I…", "como faço…". Una charla normal
 * ("que onda", "es temprano", "para mañana") no.
 */
export function preguntaPorElBot(texto: string): boolean {
  const t = normalizar(texto)
  return (
    /\b(comandos?|commands?|menu)\b/.test(t) ||
    /\bcomo (hago|hacer|se hace|uso|usar|se usa|puedo|pongo|activo|desactivo|descargo|juego|veo|creo|saco|consigo|gano|subo|cambio|mando|envio|convierto|busco)\b/.test(t) ||
    /\b(para que sirve|que hace el|hay (algun|un|alguna|una) (comando|forma|manera)|se puede)\b/.test(t) ||
    /\b(how (do|can) i|is there a|what does)\b/.test(t) ||
    /\b(como (faco|faz|uso|eu)|tem como|da pra)\b/.test(t)
  )
}

/**
 * Raíces agrupadas por sus primeras 4 letras. Dos raíces solo coinciden si
 * comparten esas 4 (ver `coinciden`), así que para cada palabra se miran las
 * pocas de su grupo y no todas: la búsqueda pasó de ~1,1 ms a lo que se mide
 * en el test.
 */
type Raices = Map<string, string[]>

function agrupar(raices: Iterable<string>): Raices {
  const m: Raices = new Map()
  for (const r of new Set(raices)) {
    if (r.length < 4) continue
    const k = r.slice(0, 4)
    const g = m.get(k)
    if (g) g.push(r)
    else m.set(k, [r])
  }
  return m
}

const enGrupo = (m: Raices, r: string) => r.length >= 4 && !!m.get(r.slice(0, 4))?.some((x) => coinciden(x, r))

interface Entrada {
  info: ComandoInfo
  nombres: Set<string>
  /** Los nombres en una sola cadena, para buscar una palabra dentro de un alias. */
  nombresJuntos: string
  raicesNombre: Raices
  raicesTexto: Raices
}

/** El índice de búsqueda; `traducciones` da la descripción en inglés y portugués. */
export function indexar(
  comandos: Iterable<ComandoInfo>,
  traducciones: (c: ComandoInfo) => string[] = () => [],
): Entrada[] {
  const out: Entrada[] = []
  for (const c of comandos) {
    if (FUERA.has(c.category)) continue
    const nombres = new Set([c.name, ...(c.aliases ?? [])].map(normalizar))
    const texto = [c.description, ...traducciones(c)].join(' ')
    out.push({
      info: c,
      nombres,
      nombresJuntos: [...nombres].join(' '),
      raicesNombre: agrupar([...nombres].map(raiz)),
      raicesTexto: agrupar(palabras(texto).map(raiz)),
    })
  }
  return out
}

/** Los comandos que más se parecen a lo que preguntó, de mejor a peor. */
export function buscar(texto: string, indice: readonly Entrada[], max = 4): ComandoInfo[] {
  const propias = [...new Set(palabras(texto))]
  if (!propias.length) return []
  const ps = conSinonimos(propias)
  const raices = ps.map(raiz)
  const puntaje = (e: Entrada) => {
    let n = 0
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!
      const r = raices[i]!
      if (e.nombres.has(p)) n += 5
      else if (enGrupo(e.raicesNombre, r)) n += 3
      // "fondo" dentro de "sinfondo" o "quitarfondo".
      else if (p.length >= 4 && e.nombresJuntos.includes(p)) n += 3
      else if (enGrupo(e.raicesTexto, r)) n += 1
    }
    return n
  }
  // Con una sola palabra que diga algo ("faço figurinha"), alcanza con que
  // aparezca; con más, que coincida más de una o el nombre.
  const minimo = propias.length === 1 ? 1 : 2
  return indice
    .map((e) => ({ e, n: puntaje(e) }))
    .filter((x) => x.n >= minimo)
    .sort((a, b) => b.n - a.n || a.e.info.name.localeCompare(b.e.info.name))
    .slice(0, max)
    .map((x) => x.e.info)
}

const ENCABEZADO: Record<Idioma, string> = {
  es: 'Comandos del bot que pueden servir para lo que pregunta (se escriben con el prefijo {p}):',
  en: 'Bot commands that may help with what they ask (written with the prefix {p}):',
  pt: 'Comandos do bot que podem servir para o que pergunta (escritos com o prefixo {p}):',
}
const CIERRE: Record<Idioma, string> = {
  es: 'Si pregunta cómo hacer algo con el bot, recomiéndale el que sirva, con su prefijo. No inventes comandos que no estén en esta lista.',
  en: "If they ask how to do something with the bot, recommend the one that fits, with its prefix. Don't make up commands that aren't on this list.",
  pt: 'Se perguntar como fazer algo com o bot, recomende o que servir, com o prefixo. Não invente comandos que não estejam nesta lista.',
}

/** El bloque que acompaña al mensaje, o '' si no hay nada que sugerir. */
export function bloque(
  comandos: readonly ComandoInfo[],
  prefijo: string,
  idioma: Idioma,
  describir: (c: ComandoInfo) => string = (c) => c.description,
): string {
  if (!comandos.length) return ''
  return [
    ENCABEZADO[idioma].replace('{p}', prefijo),
    ...comandos.map((c) => `- ${prefijo}${c.name}: ${describir(c)}`),
    CIERRE[idioma],
  ].join('\n')
}

// ─── Lo que usa el bot ────────────────────────────────────────────────────────

let indiceCache: Entrada[] | null = null

/**
 * Los comandos que sirven para lo que preguntó, ya como texto para la IA; ''
 * si no preguntó por el bot o si nada sirve. `comandos` es el registro real
 * (se lee una vez: el índice queda armado).
 */
export async function ayudaDeComandos(
  texto: string,
  idioma: Idioma,
  prefijo: string,
  comandos: () => Iterable<ComandoInfo>,
): Promise<string> {
  if (!preguntaPorElBot(texto)) return ''
  const { descripcion } = await import('./i18nDescriptions.js')
  indiceCache ??= indexar(comandos(), (c) => [descripcion(c, 'en'), descripcion(c, 'pt')])
  const hallados = buscar(texto, indiceCache)
  return bloque(hallados, prefijo, idioma, (c) => descripcion(c, idioma))
}
