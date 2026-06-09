// ─── Coding Quiz System ───────────────────────────────────────────────────────

export type QuizDifficulty = 'fácil' | 'medio' | 'difícil' | 'experto' | 'extremo'
export type QuizCategory   = 'javascript' | 'python' | 'algoritmos' | 'web' | 'general'

export interface QuizQuestion {
  id:          string
  question:    string
  options:     string[]
  answer:      number    // 0-indexed
  difficulty:  QuizDifficulty
  category:    QuizCategory
  hint?:       string
  explanation?: string
}

export interface QuizSession {
  userId:      string
  questions:   QuizQuestion[]
  current:     number
  score:       number
  correct:     number
  incorrect:   number
  startTime:   number
  lastQ:       number
  hintsUsed:   number
  category?:   QuizCategory
  difficulty?: QuizDifficulty
}

export interface QuizProfile {
  elo:         number
  gamesPlayed: number
  correct:     number
  incorrect:   number
  streak:      number
  bestStreak:  number
}

// ─── Question Bank ────────────────────────────────────────────────────────────

export const QUESTIONS: readonly QuizQuestion[] = [
  // ── JavaScript ──────────────────────────────────────────────────────────────
  {
    id: 'js01', category: 'javascript', difficulty: 'fácil',
    question: '¿Qué devuelve `typeof null` en JavaScript?',
    options: ['"null"', '"object"', '"undefined"', '"boolean"'],
    answer: 1,
    hint: 'Es un bug histórico del lenguaje, presente desde la versión 1',
    explanation: '`typeof null === "object"` es un bug conocido de JavaScript desde 1995',
  },
  {
    id: 'js02', category: 'javascript', difficulty: 'fácil',
    question: '¿Cuál es la diferencia principal entre `==` y `===`?',
    options: ['No hay diferencia', '=== es más lento', '=== compara tipo y valor', '== es más seguro'],
    answer: 2,
    hint: 'Piensa en "strict equality"',
  },
  {
    id: 'js03', category: 'javascript', difficulty: 'medio',
    question: '¿Qué imprime: `console.log(0.1 + 0.2 === 0.3)`?',
    options: ['true', 'false', 'NaN', 'error'],
    answer: 1,
    hint: 'Floating-point arithmetic en IEEE 754',
    explanation: '0.1 + 0.2 = 0.30000000000000004 en punto flotante',
  },
  {
    id: 'js04', category: 'javascript', difficulty: 'medio',
    question: '¿Qué devuelve `[1,2,3].reduce((acc, x) => acc + x, 0)`?',
    options: ['[1,2,3]', '6', '123', 'undefined'],
    answer: 1,
    hint: 'reduce acumula valores, empieza en 0',
  },
  {
    id: 'js05', category: 'javascript', difficulty: 'difícil',
    question: '¿Cuál es el output de: `(function(){ return; { value: 1 } })()`?',
    options: ['{ value: 1 }', '1', 'undefined', 'SyntaxError'],
    answer: 2,
    hint: 'Automatic Semicolon Insertion (ASI)',
    explanation: 'El parser inserta ; después de return, así retorna undefined',
  },
  {
    id: 'js06', category: 'javascript', difficulty: 'difícil',
    question: '¿Qué es un "closure" en JavaScript?',
    options: [
      'Una función que se cierra sola',
      'Una función con acceso al scope donde fue creada',
      'Una función asíncrona',
      'Un objeto sellado',
    ],
    answer: 1,
    hint: 'Tiene que ver con el lexical scope',
  },
  {
    id: 'js07', category: 'javascript', difficulty: 'experto',
    question: '¿Qué devuelve `Promise.resolve(1).then(x => x + 1).then(x => { throw x }).catch(x => x * 2)`?',
    options: ['Promise<2>', 'Promise<4>', 'Promise<rejected>', 'Promise<3>'],
    answer: 1,
    hint: 'La cadena: 1 → 2 → throw 2 → catch(2) → 2*2',
  },
  {
    id: 'js08', category: 'javascript', difficulty: 'experto',
    question: '¿Cuál es el resultado de `Object.is(NaN, NaN)`?',
    options: ['false', 'true', 'undefined', 'TypeError'],
    answer: 1,
    hint: 'Object.is es más preciso que ===',
    explanation: 'A diferencia de ===, Object.is(NaN, NaN) retorna true',
  },
  {
    id: 'js09', category: 'javascript', difficulty: 'fácil',
    question: '¿Cuál de estas NO es una forma de declarar una variable en JS moderno?',
    options: ['let', 'const', 'var', 'def'],
    answer: 3,
    hint: '`def` es de Python',
  },
  {
    id: 'js10', category: 'javascript', difficulty: 'medio',
    question: '¿Qué hace `Array.from({length: 3}, (_, i) => i)`?',
    options: ['[undefined, undefined, undefined]', '[0, 1, 2]', '[1, 2, 3]', 'Error'],
    answer: 1,
    hint: 'Crea un array usando la longitud y el índice',
  },
  // ── Python ──────────────────────────────────────────────────────────────────
  {
    id: 'py01', category: 'python', difficulty: 'fácil',
    question: '¿Cuál es la forma correcta de comentar en Python?',
    options: ['// comentario', '/* comentario */', '# comentario', '-- comentario'],
    answer: 2,
    hint: 'Un símbolo de almohadilla',
  },
  {
    id: 'py02', category: 'python', difficulty: 'fácil',
    question: '¿Qué devuelve `type([1,2,3])`?',
    options: ['<class \'array\'>', '<class \'list\'>', '<class \'tuple\'>', '<class \'dict\'>'],
    answer: 1,
    hint: 'Los corchetes [] en Python crean...',
  },
  {
    id: 'py03', category: 'python', difficulty: 'medio',
    question: '¿Cuál es el output de `[x**2 for x in range(4)]`?',
    options: ['[1, 4, 9, 16]', '[0, 1, 4, 9]', '[0, 2, 4, 6]', '[0, 1, 8, 27]'],
    answer: 1,
    hint: 'range(4) genera 0, 1, 2, 3',
  },
  {
    id: 'py04', category: 'python', difficulty: 'medio',
    question: '¿Qué diferencia hay entre una lista y una tupla en Python?',
    options: [
      'Las tuplas son más lentas',
      'Las listas usan [] y las tuplas () y las tuplas son inmutables',
      'No hay diferencia',
      'Las tuplas no pueden tener duplicados',
    ],
    answer: 1,
    hint: 'Una palabra clave: inmutabilidad',
  },
  {
    id: 'py05', category: 'python', difficulty: 'difícil',
    question: '¿Qué hace el decorador `@staticmethod`?',
    options: [
      'Convierte el método en una propiedad',
      'Define un método que no recibe self ni cls',
      'Cachea el resultado del método',
      'Define un método abstracto',
    ],
    answer: 1,
    hint: 'No necesita instancia ni clase para llamarse',
  },
  {
    id: 'py06', category: 'python', difficulty: 'difícil',
    question: '¿Cuál es el output de `print("Python"[1:4])`?',
    options: ['"ytho"', '"yth"', '"Pyt"', '"thon"'],
    answer: 1,
    hint: 'Slicing: índice 1 incluido, 4 excluido',
  },
  {
    id: 'py07', category: 'python', difficulty: 'experto',
    question: '¿Qué imprime `print(*[*range(3)])`?',
    options: ['[0, 1, 2]', '0 1 2', '(0, 1, 2)', 'range(0, 3)'],
    answer: 1,
    hint: 'El * desempaca una lista en argumentos',
  },
  {
    id: 'py08', category: 'python', difficulty: 'fácil',
    question: '¿Cuál operador es la división entera en Python?',
    options: ['/', '//', '%', '**'],
    answer: 1,
    hint: 'Dos barras',
  },
  // ── Algoritmos ───────────────────────────────────────────────────────────────
  {
    id: 'al01', category: 'algoritmos', difficulty: 'fácil',
    question: '¿Cuál es la complejidad temporal de buscar en un array ordenado con búsqueda binaria?',
    options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'],
    answer: 1,
    hint: 'Divide el espacio de búsqueda a la mitad en cada paso',
  },
  {
    id: 'al02', category: 'algoritmos', difficulty: 'fácil',
    question: '¿Qué es una cola (queue)?',
    options: [
      'Estructura LIFO — el último en entrar es el primero en salir',
      'Estructura FIFO — el primero en entrar es el primero en salir',
      'Una lista enlazada circular',
      'Un árbol binario de búsqueda',
    ],
    answer: 1,
    hint: 'Como una fila en el supermercado',
  },
  {
    id: 'al03', category: 'algoritmos', difficulty: 'medio',
    question: '¿Cuál algoritmo de ordenamiento tiene la mejor complejidad promedio?',
    options: ['Bubble Sort O(n²)', 'QuickSort O(n log n)', 'Insertion Sort O(n²)', 'Selection Sort O(n²)'],
    answer: 1,
    hint: 'Se basa en "divide y vencerás"',
  },
  {
    id: 'al04', category: 'algoritmos', difficulty: 'medio',
    question: '¿Cuánto espacio extra usa Merge Sort?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
    answer: 2,
    hint: 'Necesita arreglos auxiliares para la mezcla',
  },
  {
    id: 'al05', category: 'algoritmos', difficulty: 'difícil',
    question: '¿Cuál es la diferencia entre BFS y DFS?',
    options: [
      'BFS usa pila, DFS usa cola',
      'BFS explora nivel a nivel (cola), DFS sigue un camino hasta el final (pila)',
      'Son lo mismo con nombres distintos',
      'BFS es solo para grafos, DFS solo para árboles',
    ],
    answer: 1,
    hint: 'BFS = Breadth-First (anchura), DFS = Depth-First (profundidad)',
  },
  {
    id: 'al06', category: 'algoritmos', difficulty: 'difícil',
    question: '¿Para qué se usa el algoritmo de Dijkstra?',
    options: [
      'Ordenar arrays',
      'Encontrar el camino más corto desde un nodo fuente',
      'Detectar ciclos en grafos',
      'Comprimir texto',
    ],
    answer: 1,
    hint: 'Grafos con pesos no negativos',
  },
  {
    id: 'al07', category: 'algoritmos', difficulty: 'experto',
    question: '¿Qué garantiza el invariante del heap en un Min-Heap?',
    options: [
      'Los hijos son siempre mayores que el padre',
      'El nodo raíz siempre es el menor elemento',
      'El árbol está perfectamente balanceado',
      'Todos los nodos hoja son iguales',
    ],
    answer: 1,
    hint: 'Min = mínimo en la cima',
  },
  // ── Web ───────────────────────────────────────────────────────────────────────
  {
    id: 'wb01', category: 'web', difficulty: 'fácil',
    question: '¿Qué significa HTTP?',
    options: [
      'HyperText Transfer Protocol',
      'HighText Terminal Protocol',
      'HyperText Tracking Process',
      'High Transfer Text Protocol',
    ],
    answer: 0,
    hint: 'HyperText...',
  },
  {
    id: 'wb02', category: 'web', difficulty: 'fácil',
    question: '¿Qué método HTTP se usa para obtener datos de un servidor?',
    options: ['POST', 'GET', 'PUT', 'DELETE'],
    answer: 1,
    hint: 'Recibir, obtener...',
  },
  {
    id: 'wb03', category: 'web', difficulty: 'medio',
    question: '¿Cuál es el código de estado HTTP para "Not Found"?',
    options: ['200', '301', '404', '500'],
    answer: 2,
    hint: 'El más famoso de los errores web',
  },
  {
    id: 'wb04', category: 'web', difficulty: 'medio',
    question: '¿Qué es CORS?',
    options: [
      'Un tipo de base de datos',
      'Mecanismo de seguridad que controla acceso de recursos entre orígenes distintos',
      'Un protocolo de encriptación',
      'Un framework de CSS',
    ],
    answer: 1,
    hint: 'Cross-Origin Resource Sharing',
  },
  {
    id: 'wb05', category: 'web', difficulty: 'difícil',
    question: '¿Cuál es la diferencia entre localStorage y sessionStorage?',
    options: [
      'localStorage persiste hasta ser borrado, sessionStorage se borra al cerrar la pestaña',
      'sessionStorage es más seguro',
      'localStorage solo funciona en HTTPS',
      'Son exactamente lo mismo',
    ],
    answer: 0,
    hint: 'Piensa en la duración de la sesión',
  },
  {
    id: 'wb06', category: 'web', difficulty: 'difícil',
    question: '¿Qué es un WebSocket?',
    options: [
      'Un tipo de CSS avanzado',
      'Protocolo de comunicación bidireccional y persistente entre cliente y servidor',
      'Una API de almacenamiento web',
      'Un método de autenticación',
    ],
    answer: 1,
    hint: 'Permite que el servidor también envíe datos al cliente',
  },
  {
    id: 'wb07', category: 'web', difficulty: 'experto',
    question: '¿Qué es el "Event Loop" en Node.js?',
    options: [
      'Un loop for que itera eventos del DOM',
      'Mecanismo que permite operaciones no bloqueantes procesando callbacks en una sola hebra',
      'Un sistema de manejo de errores',
      'Una función que corre cada segundo',
    ],
    answer: 1,
    hint: 'JavaScript es single-threaded pero no bloqueante',
  },
  // ── General ────────────────────────────────────────────────────────────────
  {
    id: 'gn01', category: 'general', difficulty: 'fácil',
    question: '¿Qué significa "API"?',
    options: [
      'Advanced Programming Interface',
      'Application Programming Interface',
      'Applied Program Integration',
      'Automated Process Interface',
    ],
    answer: 1,
    hint: 'Application...',
  },
  {
    id: 'gn02', category: 'general', difficulty: 'fácil',
    question: '¿Cuál es el lenguaje más bajo nivel de los siguientes?',
    options: ['Python', 'JavaScript', 'C', 'TypeScript'],
    answer: 2,
    hint: 'Acceso directo a punteros y memoria',
  },
  {
    id: 'gn03', category: 'general', difficulty: 'medio',
    question: '¿Qué significa "OOP"?',
    options: [
      'Optimal Object Programming',
      'Object-Oriented Programming',
      'Open Object Protocol',
      'Ordered Operation Process',
    ],
    answer: 1,
    hint: 'Programación orientada a...',
  },
  {
    id: 'gn04', category: 'general', difficulty: 'medio',
    question: '¿Cuál de estos es un sistema de control de versiones?',
    options: ['Docker', 'Git', 'npm', 'Webpack'],
    answer: 1,
    hint: 'Lo usas con `git commit`',
  },
  {
    id: 'gn05', category: 'general', difficulty: 'difícil',
    question: '¿Qué es "Big O" en algoritmia?',
    options: [
      'Un framework de JavaScript',
      'Notación para describir la complejidad temporal/espacial en el peor caso',
      'Una técnica de compresión',
      'Un tipo de estructura de datos',
    ],
    answer: 1,
    hint: 'Mide qué tan rápido crece el tiempo de ejecución',
  },
  {
    id: 'gn06', category: 'general', difficulty: 'difícil',
    question: '¿Qué es la "inmutabilidad" en programación funcional?',
    options: [
      'Que las funciones no tienen efectos secundarios',
      'Que los datos no se modifican, se crean nuevas versiones',
      'Que las variables son constantes globales',
      'Que el código no puede tener bugs',
    ],
    answer: 1,
    hint: 'En lugar de mutar, creas nuevas copias',
  },
  {
    id: 'gn07', category: 'general', difficulty: 'experto',
    question: '¿Qué es el "Teorema CAP" en sistemas distribuidos?',
    options: [
      'Un algoritmo de cifrado',
      'Establece que un sistema solo puede garantizar 2 de: Consistencia, Disponibilidad y Tolerancia a particiones',
      'Un patrón de diseño de bases de datos',
      'Un protocolo de red',
    ],
    answer: 1,
    hint: 'Consistency, Availability, Partition tolerance — solo 2 de 3',
  },
  {
    id: 'gn08', category: 'general', difficulty: 'extremo',
    question: '¿Cuál es la diferencia entre un proceso y un hilo (thread)?',
    options: [
      'Los procesos son más rápidos',
      'Un proceso tiene su propio espacio de memoria; los hilos comparten el espacio del proceso padre',
      'Los hilos no pueden comunicarse entre sí',
      'No hay diferencia práctica',
    ],
    answer: 1,
    hint: 'Piensa en memoria compartida vs. aislada',
  },
]

// ─── Active sessions ──────────────────────────────────────────────────────────

const activeSessions = new Map<string, QuizSession>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

const DIFF_SCORE: Record<QuizDifficulty, number> = {
  'fácil':  10,
  'medio':  20,
  'difícil':35,
  'experto':50,
  'extremo':75,
}

// ─── Quiz Manager ─────────────────────────────────────────────────────────────

export class QuizManager {
  static defaultProfile(): QuizProfile {
    return { elo: 800, gamesPlayed: 0, correct: 0, incorrect: 0, streak: 0, bestStreak: 0 }
  }

  static startSession(
    userId:     string,
    size       = 10,
    category?:  QuizCategory,
    difficulty?: QuizDifficulty,
  ): QuizSession {
    let pool = [...QUESTIONS]
    if (category)   pool = pool.filter(q => q.category   === category)
    if (difficulty) pool = pool.filter(q => q.difficulty === difficulty)
    if (!pool.length) pool = [...QUESTIONS]

    const questions = shuffle(pool).slice(0, Math.min(size, pool.length))
    const session: QuizSession = {
      userId,
      questions,
      current:    0,
      score:      0,
      correct:    0,
      incorrect:  0,
      startTime:  Date.now(),
      lastQ:      Date.now(),
      hintsUsed:  0,
      ...(category   !== undefined && { category }),
      ...(difficulty !== undefined && { difficulty }),
    }
    activeSessions.set(userId, session)
    return session
  }

  static getSession(userId: string): QuizSession | undefined { return activeSessions.get(userId) }

  static endSession(userId: string): void { activeSessions.delete(userId) }

  static formatQuestion(q: QuizQuestion, n: number, total: number): string {
    const difEmoji = { 'fácil': '🟢', 'medio': '🟡', 'difícil': '🟠', 'experto': '🔴', 'extremo': '⚫' }[q.difficulty]
    const lines = [
      `*📝 PREGUNTA ${n}/${total}* ${difEmoji} ${q.difficulty}`,
      `_Categoría: ${q.category}_`,
      '',
      q.question,
      '',
    ]
    const letters = ['1️⃣', '2️⃣', '3️⃣', '4️⃣']
    q.options.forEach((opt, i) => lines.push(`${letters[i]} ${opt}`))
    lines.push('', `_Responde con 1, 2, 3 o 4_`)
    return lines.join('\n')
  }

  static answer(session: QuizSession, input: string): {
    correct: boolean
    pointsGained: number
    explanation?: string
    over: boolean
  } {
    const q    = session.questions[session.current]!
    const idx  = parseInt(input.trim()) - 1
    const correct = idx === q.answer

    const pts = correct ? DIFF_SCORE[q.difficulty] - session.hintsUsed * 3 : 0
    if (correct) { session.score += pts; session.correct++ }
    else          session.incorrect++

    session.current++
    const over = session.current >= session.questions.length

    const base = { correct, pointsGained: Math.max(0, pts), over }
    if (q.explanation !== undefined) return { ...base, explanation: q.explanation }
    return base
  }

  static giveHint(session: QuizSession): string | null {
    const q = session.questions[session.current]
    if (!q) return null
    session.hintsUsed++
    return q.hint ?? '_Sin pista disponible para esta pregunta_'
  }

  static formatResult(session: QuizSession): string {
    const elapsed = Math.floor((Date.now() - session.startTime) / 1000)
    const total   = session.questions.length
    const pct     = Math.round(session.correct / total * 100)
    const medal   = pct >= 90 ? '🏆' : pct >= 70 ? '🥈' : pct >= 50 ? '🥉' : '📉'
    return [
      `*📊 RESULTADOS DEL QUIZ* ${medal}`,
      '',
      `✅ Correctas: ${session.correct}/${total} (${pct}%)`,
      `❌ Incorrectas: ${session.incorrect}`,
      `⭐ Puntuación: *${session.score}* pts`,
      `💡 Pistas usadas: ${session.hintsUsed}`,
      `⏱️ Tiempo: ${elapsed}s`,
    ].join('\n')
  }

  static updateElo(profile: QuizProfile, correct: boolean, difficulty: QuizDifficulty): number {
    const expected  = 0.5
    const k         = { 'fácil': 8, 'medio': 16, 'difícil': 24, 'experto': 32, 'extremo': 40 }[difficulty]
    const actual    = correct ? 1 : 0
    const delta     = Math.round(k * (actual - expected))
    profile.elo     = Math.max(100, profile.elo + delta)
    if (correct) { profile.correct++; profile.streak++; profile.bestStreak = Math.max(profile.bestStreak, profile.streak) }
    else          { profile.incorrect++; profile.streak = 0 }
    return delta
  }
}
