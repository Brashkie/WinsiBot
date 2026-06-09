import { EventEmitter } from 'events'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — GENERIC QUEUE
//  Cola genérica con concurrencia configurable, timeout por tarea y pause/resume.
// ─────────────────────────────────────────────────────────────────────────────

interface QueueTask<T> {
  id:        string
  fn:        () => Promise<T>
  resolve:   (v: T)       => void
  reject:    (e: unknown) => void
  timeoutMs?: number
}

export class Queue<T = unknown> extends EventEmitter {
  private _pending:   QueueTask<T>[] = []
  private _active     = 0
  private _paused     = false
  private _processed  = 0
  private _failed     = 0

  constructor(private readonly concurrency = 1) {
    super()
  }

  /**
   * Encola una tarea y devuelve una Promise con su resultado.
   * @param fn         Función asíncrona a ejecutar.
   * @param timeoutMs  Abortar la tarea si supera este tiempo (opcional).
   */
  enqueue(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = Math.random().toString(36).slice(2, 10)
      this._pending.push({ id, fn, resolve, reject, ...(timeoutMs != null && { timeoutMs }) })
      this.emit('enqueue', { id, size: this._pending.length + this._active })
      this._flush()
    })
  }

  /** Posición en la cola de espera (−1 = ya en ejecución o no existe). */
  position(id: string): number {
    return this._pending.findIndex(t => t.id === id)
  }

  /** Promise que resuelve cuando pending + active quedan en cero. */
  processAll(): Promise<void> {
    return new Promise(resolve => {
      if (!this._pending.length && !this._active) { resolve(); return }
      this.once('idle', resolve)
    })
  }

  /** Rechaza y descarta todas las tareas pendientes (las activas terminan). */
  clear(): void {
    this._pending.forEach(t => t.reject(new Error('Queue cleared')))
    this._pending = []
  }

  /** Detiene el despacho de nuevas tareas (las activas siguen hasta terminar). */
  pause(): void { this._paused = true }

  /** Reanuda el despacho de tareas. */
  resume(): void {
    this._paused = false
    this._flush()
  }

  stats() {
    return {
      pending:     this._pending.length,
      active:      this._active,
      processed:   this._processed,
      failed:      this._failed,
      concurrency: this.concurrency,
      paused:      this._paused,
    }
  }

  /** Total de tareas en la cola (pending + active). */
  get size(): number { return this._pending.length + this._active }

  private _flush(): void {
    while (!this._paused && this._pending.length > 0 && this._active < this.concurrency) {
      const task = this._pending.shift()!
      this._active++
      void this._exec(task)
    }
  }

  private async _exec(task: QueueTask<T>): Promise<void> {
    try {
      const fn: () => Promise<T> = task.timeoutMs != null
        ? () => Promise.race([
            task.fn(),
            new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error(`Task ${task.id} timed out after ${task.timeoutMs}ms`)), task.timeoutMs!),
            ),
          ])
        : task.fn

      const result = await fn()
      task.resolve(result)
      this._processed++
      this.emit('done', { id: task.id, processed: this._processed })
    } catch (e) {
      task.reject(e)
      this._failed++
      this.emit('task-error', { id: task.id, error: e })
    } finally {
      this._active--
      this._flush()
      if (!this._active && !this._pending.length) this.emit('idle')
    }
  }
}

/** Cola singleton de propósito general (concurrencia = 1). */
export const queue = new Queue()
