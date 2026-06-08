import { EventEmitter } from 'events'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — GENERIC QUEUE
//  Cola genérica con EventEmitter: enqueue, wait, processAll, stats.
// ─────────────────────────────────────────────────────────────────────────────

interface QueueTask<T> {
  id:      string
  fn:      () => Promise<T>
  resolve: (v: T)       => void
  reject:  (e: unknown) => void
}

export class Queue<T = unknown> extends EventEmitter {
  private _tasks:     QueueTask<T>[] = []
  private _running    = false
  private _processed  = 0
  private _failed     = 0

  /** Encola una tarea y devuelve una Promise con su resultado. */
  enqueue(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = Math.random().toString(36).slice(2, 10)
      this._tasks.push({ id, fn, resolve, reject })
      this.emit('enqueue', { id, size: this._tasks.length })
      void this._run()
    })
  }

  /** Posición en la cola (−1 si no está). */
  position(id: string): number {
    return this._tasks.findIndex(t => t.id === id)
  }

  /** Promise que resuelve cuando la cola queda vacía. */
  processAll(): Promise<void> {
    return new Promise(resolve => {
      if (!this._tasks.length && !this._running) return resolve()
      this.once('idle', resolve)
    })
  }

  /** Descarta todas las tareas pendientes (las en curso siguen). */
  clear(): void {
    this._tasks.forEach(t => t.reject(new Error('Queue cleared')))
    this._tasks = []
  }

  stats() {
    return {
      pending:   this._tasks.length,
      running:   this._running,
      processed: this._processed,
      failed:    this._failed,
    }
  }

  get size(): number { return this._tasks.length }

  private async _run(): Promise<void> {
    if (this._running) return
    this._running = true

    while (this._tasks.length > 0) {
      const task = this._tasks.shift()!
      try {
        const result = await task.fn()
        task.resolve(result)
        this._processed++
        this.emit('done', { id: task.id, processed: this._processed })
      } catch (e) {
        task.reject(e)
        this._failed++
        this.emit('task-error', { id: task.id, error: e })
      }
    }

    this._running = false
    this.emit('idle')
  }
}

/** Cola singleton de propósito general. */
export const queue = new Queue()
