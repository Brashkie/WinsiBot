// ─── Draw & Guess ─────────────────────────────────────────────────────────────

export type DrawCategory = 'animales' | 'tecnología' | 'comida' | 'naturaleza' | 'objetos' | 'profesiones' | 'deportes' | 'países'

export interface DrawWord {
  word:     string
  category: DrawCategory
  hints:    string[]    // progressive hints revealed over time
}

export interface DrawPlayer {
  jid:        string
  name:       string
  score:      number
  guessed:    number
  drew:       number
}

export interface DrawGame {
  groupJid:    string
  drawer:      string    // JID of current drawer
  word:        DrawWord
  round:       number
  maxRounds:   number
  players:     Map<string, DrawPlayer>
  guessed:     Set<string>
  startTime:   number
  hintLevel:   number    // 0-3
  hintTimer:   NodeJS.Timeout | null
  endTimer:    NodeJS.Timeout | null
  active:      boolean
}

// ─── Word Bank ────────────────────────────────────────────────────────────────

export const WORDS: readonly DrawWord[] = [
  // Animales
  { word: 'perro',     category: 'animales',    hints: ['tiene 4 patas', 'ladra', 'mejor amigo del hombre'] },
  { word: 'gato',      category: 'animales',    hints: ['tiene bigotes', 'maúlla', 'le gusta el pescado'] },
  { word: 'elefante',  category: 'animales',    hints: ['es gris', 'tiene trompa', 'animal más grande terrestre'] },
  { word: 'pingüino',  category: 'animales',    hints: ['no puede volar', 'vive en el frío', 'camina graciosamente'] },
  { word: 'tiburón',   category: 'animales',    hints: ['vive en el mar', 'tiene aleta', 'dientes muy afilados'] },
  { word: 'cocodrilo', category: 'animales',    hints: ['vive en ríos', 'tiene escamas', 'mandíbulas poderosas'] },
  { word: 'canguro',   category: 'animales',    hints: ['tiene bolsa', 'salta mucho', 'vive en Australia'] },
  { word: 'jirafa',    category: 'animales',    hints: ['cuello muy largo', 'manchas', 'come hojas de árboles'] },
  { word: 'mariposa',  category: 'animales',    hints: ['tiene alas de colores', 'vuela', 'fue oruga'] },
  { word: 'pulpo',     category: 'animales',    hints: ['8 tentáculos', 'suelta tinta', 'vive en el mar'] },
  // Tecnología
  { word: 'teclado',   category: 'tecnología',  hints: ['tiene teclas', 'usas para escribir', 'conecta al PC'] },
  { word: 'ratón',     category: 'tecnología',  hints: ['se mueve', 'tiene clic', 'controla el cursor'] },
  { word: 'monitor',   category: 'tecnología',  hints: ['pantalla', 'muestra imágenes', 'conecta a la PC'] },
  { word: 'auricular', category: 'tecnología',  hints: ['suena música', 'va en las orejas', 'tiene cable o BT'] },
  { word: 'router',    category: 'tecnología',  hints: ['WiFi', 'tiene antenas', 'da internet en casa'] },
  { word: 'servidor',  category: 'tecnología',  hints: ['computadora grande', 'almacena datos', 'siempre encendido'] },
  { word: 'USB',       category: 'tecnología',  hints: ['puerto pequeño', 'transfiere datos', 'forma rectangular'] },
  { word: 'cámara',    category: 'tecnología',  hints: ['saca fotos', 'tiene lente', 'graba vídeo'] },
  { word: 'batería',   category: 'tecnología',  hints: ['da energía', 'se recarga', 'va en el celular'] },
  { word: 'cable',     category: 'tecnología',  hints: ['flexible', 'conduce electricidad', 'conecta dispositivos'] },
  // Comida
  { word: 'pizza',     category: 'comida',      hints: ['es redonda', 'tiene queso', 'viene de Italia'] },
  { word: 'sushi',     category: 'comida',      hints: ['comida japonesa', 'lleva arroz', 'a veces tiene pescado crudo'] },
  { word: 'hamburguesa',category: 'comida',     hints: ['tiene pan', 'carne dentro', 'le pones ketchup'] },
  { word: 'tacos',     category: 'comida',      hints: ['comida mexicana', 'tortilla doblada', 'rellenos variados'] },
  { word: 'helado',    category: 'comida',      hints: ['está frío', 'dulce', 'viene en cono o vaso'] },
  { word: 'aguacate',  category: 'comida',      hints: ['es verde por dentro', 'forma de pera', 'hacen guacamole'] },
  { word: 'sandía',    category: 'comida',      hints: ['verde por fuera', 'roja por dentro', 'semillas negras'] },
  { word: 'pasta',     category: 'comida',      hints: ['italiana', 'se hace con harina', 'muchas formas'] },
  // Naturaleza
  { word: 'volcán',    category: 'naturaleza',  hints: ['montaña', 'tiene lava', 'puede explotar'] },
  { word: 'arcoíris',  category: 'naturaleza',  hints: ['7 colores', 'aparece después de lluvia', 'curvo'] },
  { word: 'tornado',   category: 'naturaleza',  hints: ['viento giratorio', 'destruye todo', 'embudo negro'] },
  { word: 'glaciar',   category: 'naturaleza',  hints: ['hielo gigante', 'se mueve lento', 'en montañas'] },
  { word: 'río',       category: 'naturaleza',  hints: ['agua dulce', 'fluye', 'llega al mar o lago'] },
  // Objetos
  { word: 'paraguas',  category: 'objetos',     hints: ['protege de la lluvia', 'se abre', 'tienes que sostenerlo'] },
  { word: 'linterna',  category: 'objetos',     hints: ['da luz', 'portátil', 'usa baterías'] },
  { word: 'reloj',     category: 'objetos',     hints: ['da la hora', 'tiene manecillas', 'en la muñeca'] },
  { word: 'tijeras',   category: 'objetos',     hints: ['cortan', 'dos hojas', 'para papel o tela'] },
  { word: 'ancla',     category: 'objetos',     hints: ['de barco', 'se hunde', 'evita que el barco se mueva'] },
  { word: 'llave',     category: 'objetos',     hints: ['abre puertas', 'de metal', 'va en un llavero'] },
  // Profesiones
  { word: 'médico',    category: 'profesiones', hints: ['cuida enfermos', 'usa bata blanca', 'tiene estetoscopio'] },
  { word: 'chef',      category: 'profesiones', hints: ['cocina', 'tiene gorro blanco', 'trabaja en restaurante'] },
  { word: 'astronauta',category: 'profesiones', hints: ['va al espacio', 'tiene traje espacial', 'sin gravedad'] },
  { word: 'bombero',   category: 'profesiones', hints: ['apaga fuegos', 'usa casco', 'tiene manguera'] },
  { word: 'detective', category: 'profesiones', hints: ['resuelve casos', 'busca pistas', 'lupa'] },
  // Deportes
  { word: 'fútbol',    category: 'deportes',    hints: ['pelota redonda', '11 jugadores', 'gol'] },
  { word: 'natación',  category: 'deportes',    hints: ['en agua', 'se usa traje de baño', 'brazadas'] },
  { word: 'ciclismo',  category: 'deportes',    hints: ['bicicleta', 'casco', 'pedaleando'] },
  { word: 'boxeo',     category: 'deportes',    hints: ['guantes', 'ring', 'golpes'] },
  { word: 'ajedrez',   category: 'deportes',    hints: ['tablero negro y blanco', '64 cuadros', 'rey y reina'] },
  // Países
  { word: 'Japón',     category: 'países',      hints: ['Asia', 'monte Fuji', 'bandea roja y blanca'] },
  { word: 'Brasil',    category: 'países',      hints: ['Sudamérica', 'Amazonas', 'carnaval'] },
  { word: 'Egipto',    category: 'países',      hints: ['pirámides', 'río Nilo', 'faraones'] },
  { word: 'Australia', category: 'países',      hints: ['canguro', 'Sídney', 'isla-continente'] },
  { word: 'México',    category: 'países',      hints: ['tacos', 'pirámides mayas', 'mariachi'] },
]

// ─── Active games ─────────────────────────────────────────────────────────────

const activeGames = new Map<string, DrawGame>()   // groupJid → DrawGame

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]! }

// ─── Draw & Guess Manager ─────────────────────────────────────────────────────

export class DrawGuessManager {
  static getGame(groupJid: string): DrawGame | undefined { return activeGames.get(groupJid) }

  static hasGame(groupJid: string): boolean { return activeGames.has(groupJid) }

  static startGame(
    groupJid:   string,
    drawerJid:  string,
    drawerName: string,
    maxRounds = 3,
    category?: DrawCategory,
  ): DrawGame {
    const pool = category ? WORDS.filter(w => w.category === category) : WORDS
    const word = pick(pool.length ? pool : WORDS)
    const players = new Map<string, DrawPlayer>()
    players.set(drawerJid, { jid: drawerJid, name: drawerName, score: 0, guessed: 0, drew: 0 })

    const game: DrawGame = {
      groupJid,
      drawer:    drawerJid,
      word,
      round:     1,
      maxRounds,
      players,
      guessed:   new Set(),
      startTime: Date.now(),
      hintLevel: 0,
      hintTimer: null,
      endTimer:  null,
      active:    true,
    }
    activeGames.set(groupJid, game)
    return game
  }

  static joinGame(game: DrawGame, jid: string, name: string): DrawPlayer {
    if (!game.players.has(jid)) {
      game.players.set(jid, { jid, name, score: 0, guessed: 0, drew: 0 })
    }
    return game.players.get(jid)!
  }

  static tryGuess(game: DrawGame, text: string, guesserJid: string): { correct: boolean; points: number } {
    if (!game.active) return { correct: false, points: 0 }
    if (guesserJid === game.drawer) return { correct: false, points: 0 }
    if (game.guessed.has(guesserJid)) return { correct: false, points: 0 }

    const normalized  = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const target      = game.word.word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

    if (normalized !== target) return { correct: false, points: 0 }

    game.guessed.add(guesserJid)
    const elapsed  = Math.floor((Date.now() - game.startTime) / 1000)
    const points   = Math.max(10, 100 - elapsed - game.hintLevel * 20)
    const player   = game.players.get(guesserJid)
    if (player) { player.score += points; player.guessed++ }

    const drawer = game.players.get(game.drawer)
    if (drawer) drawer.score += 20

    return { correct: true, points }
  }

  static nextRound(game: DrawGame, newDrawer: string, newDrawerName: string): DrawWord | null {
    if (game.round >= game.maxRounds) return null
    game.round++
    game.drawer = newDrawer
    game.guessed.clear()
    game.hintLevel  = 0
    game.startTime  = Date.now()

    const drawerPlayer = game.players.get(newDrawer)
    if (drawerPlayer) drawerPlayer.drew++

    const pool = WORDS.filter(w => w.category === game.word.category)
    game.word  = pick(pool.length ? pool : WORDS)
    return game.word
  }

  static revealHint(game: DrawGame): string | null {
    if (game.hintLevel >= game.word.hints.length) return null
    const hint = game.word.hints[game.hintLevel]!
    game.hintLevel++
    return hint
  }

  static endGame(groupJid: string): DrawPlayer[] {
    const game = activeGames.get(groupJid)
    if (!game) return []
    game.active = false
    if (game.hintTimer) clearTimeout(game.hintTimer)
    if (game.endTimer)  clearTimeout(game.endTimer)
    activeGames.delete(groupJid)
    return [...game.players.values()].sort((a, b) => b.score - a.score)
  }

  static formatScoreboard(game: DrawGame): string {
    const players = [...game.players.values()].sort((a, b) => b.score - a.score)
    const lines   = [`*🎨 PUNTUACIÓN — Ronda ${game.round}/${game.maxRounds}*`, '']
    players.forEach((p, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`
      lines.push(`${medal} ${p.name} — ${p.score} pts`)
    })
    return lines.join('\n')
  }

  static maskWord(word: string, hintLevel: number): string {
    const chars  = word.split('')
    const reveal = Math.min(hintLevel, Math.floor(word.length / 3))
    const shown  = new Set<number>()

    // Always show word length
    const mask = chars.map<string>(c => c === ' ' ? ' ' : '_ ')
    for (let i = 0; i < reveal; i++) {
      let idx: number
      do { idx = Math.floor(Math.random() * chars.length) }
      while (shown.has(idx) || chars[idx] === ' ')
      shown.add(idx)
      mask[idx] = chars[idx]!
    }
    return mask.join('') + ` (${word.length} letras)`
  }
}
