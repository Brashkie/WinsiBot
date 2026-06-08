import cron, { type ScheduledTask } from 'node-cron'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — TASK SCHEDULER
//  Tareas cron, recurrentes y one-shot con stats por tarea.
// ─────────────────────────────────────────────────────────────────────────────

type TaskFn   = () => void | Promise<void>
type TaskType = 'cron' | 'interval' | 'once'

interface Task {
  name:    string
  type:    TaskType
  handle:  ScheduledTask | ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>
  lastRun: number
  runs:    number
  errors:  number
}

const _tasks = new Map<string, Task>()

async function _safeRun(name: string, fn: TaskFn): Promise<void> {
  const t = _tasks.get(name)
  if (t) { t.lastRun = Date.now(); t.runs++ }
  try { await fn() } catch { if (t) t.errors++ }
}

// ─── API ──────────────────────────────────────────────────────────────────────

/** Agrega una tarea cron (expresión estándar de 5 o 6 campos). */
export function addTask(name: string, cronExpr: string, fn: TaskFn): void {
  removeTask(name)
  const handle = cron.schedule(cronExpr, () => _safeRun(name, fn))
  _tasks.set(name, { name, type: 'cron', handle, lastRun: 0, runs: 0, errors: 0 })
}

/** Agrega una tarea que se ejecuta cada `intervalMs` ms. */
export function addRecurring(name: string, intervalMs: number, fn: TaskFn): void {
  removeTask(name)
  const handle = setInterval(() => _safeRun(name, fn), intervalMs)
  ;(handle as NodeJS.Timeout).unref?.()
  _tasks.set(name, { name, type: 'interval', handle, lastRun: 0, runs: 0, errors: 0 })
}

/** Agrega una tarea que se ejecuta una sola vez tras `delayMs` ms. */
export function addOnce(name: string, delayMs: number, fn: TaskFn): void {
  removeTask(name)
  const handle = setTimeout(async () => {
    await _safeRun(name, fn)
    _tasks.delete(name)
  }, delayMs)
  ;(handle as NodeJS.Timeout).unref?.()
  _tasks.set(name, { name, type: 'once', handle, lastRun: 0, runs: 0, errors: 0 })
}

/** Elimina y detiene una tarea por nombre. */
export function removeTask(name: string): boolean {
  const t = _tasks.get(name)
  if (!t) return false
  if (t.type === 'cron')     (t.handle as ScheduledTask).stop()
  else if (t.type === 'interval') clearInterval(t.handle as ReturnType<typeof setInterval>)
  else                            clearTimeout(t.handle as ReturnType<typeof setTimeout>)
  _tasks.delete(name)
  return true
}

/** Elimina todas las tareas. */
export function clearAll(): void {
  for (const name of [..._tasks.keys()]) removeTask(name)
}

/** Listado de tareas con sus stats (sin el handle). */
export function listTasks(): Array<Omit<Task, 'handle'>> {
  return [..._tasks.values()].map(({ name, type, lastRun, runs, errors }) => ({
    name, type, lastRun, runs, errors,
  }))
}

export function stats() {
  const tasks = listTasks()
  return {
    total:     tasks.length,
    cron:      tasks.filter(t => t.type === 'cron').length,
    recurring: tasks.filter(t => t.type === 'interval').length,
    once:      tasks.filter(t => t.type === 'once').length,
    tasks,
  }
}
