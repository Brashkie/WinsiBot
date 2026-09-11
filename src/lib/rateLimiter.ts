/**
 * WinsiRateLimiter — control de velocidad de mensajes salientes para WhatsApp.
 *
 * Diseño:
 *  - Token bucket global: controla el throughput total (mensajes/segundo)
 *  - Token bucket por JID: evita flood a un mismo chat (anti-spam por contacto)
 *  - Cola con prioridades: urgent < normal < broadcast
 *  - Backoff automático cuando WhatsApp rechaza mensajes (429/rate-limit)
 *
 * Límites conservadores para no arriesgar ban:
 *  - Global:  8 burst, 3/seg sostenido
 *  - Grupos:  3 burst, 1/seg por chat
 *  - Privado: 2 burst, 1 cada 4s por contacto
 *  - Delay mínimo entre mensajes: 300ms
 */

const GLOBAL_CAPACITY  = 8
const GLOBAL_RATE      = 3     // tokens/segundo
const GROUP_CAPACITY   = 3
const GROUP_RATE       = 1
const PRIVATE_CAPACITY = 2
const PRIVATE_RATE     = 0.25  // 1 mensaje cada 4s
const MIN_DELAY_MS     = 300   // pausa mínima entre cualquier par de mensajes
const RATE_BACKOFF_MS  = 5_000 // cooldown al detectar rate-limit de WhatsApp

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// Techo duro por envío — sin esto, un sock.sendMessage() colgado de verdad
// (stall de red que no llega a rechazar limpio, no solo "lento") dejaba
// bloqueada TODA la cola de _run() para siempre, ya que procesa un item a la
// vez: nada mandado DESPUÉS de ese envío colgado salía nunca, para ningún
// grupo, hasta que esa promesa se resolviera sola (minutos después, por algún
// timeout de TCP de bajo nivel) — y ahí todo lo acumulado salía de golpe. Eso
// es "escribe el comando, no responde, y después de unos minutos ya manda".
// No cancela la llamada real de fondo (sigue corriendo y se descarta su
// resultado si llega tarde), solo garantiza que la cola nunca quede presa de
// un solo envío.
const SEND_TIMEOUT_MS  = 20_000
const TIMEOUT_ERROR_MSG = 'WinsiRateLimiter: send timeout'

function withSendTimeout<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT_ERROR_MSG)), SEND_TIMEOUT_MS)
    fn().then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}

// ─── Token Bucket ─────────────────────────────────────────────────────────────
class TokenBucket {
  private tokens:   number
  private lastTick: number

  constructor(
    private readonly capacity: number,
    private readonly rate: number,
  ) {
    this.tokens   = capacity
    this.lastTick = Date.now()
  }

  private refill(): void {
    const now     = Date.now()
    const elapsed = (now - this.lastTick) / 1000
    this.tokens   = Math.min(this.capacity, this.tokens + elapsed * this.rate)
    this.lastTick = now
  }

  tryConsume(): boolean {
    this.refill()
    if (this.tokens >= 1) { this.tokens -= 1; return true }
    return false
  }

  waitMs(): number {
    this.refill()
    if (this.tokens >= 1) return 0
    return Math.ceil((1 - this.tokens) / this.rate * 1000)
  }

  drain(): void {
    this.tokens = 0
  }
}

// ─── Queue item ───────────────────────────────────────────────────────────────
interface QueueItem {
  jid:      string
  fn:       () => Promise<any>
  resolve:  (v: any)   => void
  reject:   (e: any)   => void
  priority: 0 | 1 | 2   // 0=urgent, 1=normal, 2=broadcast
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
export class WinsiRateLimiter {
  private global   = new TokenBucket(GLOBAL_CAPACITY, GLOBAL_RATE)
  private buckets  = new Map<string, TokenBucket>()
  private queue:   QueueItem[] = []
  private running  = false
  private lastSend = 0

  private bucket(jid: string): TokenBucket {
    if (!this.buckets.has(jid)) {
      this.buckets.set(jid, jid.endsWith('@g.us')
        ? new TokenBucket(GROUP_CAPACITY,   GROUP_RATE)
        : new TokenBucket(PRIVATE_CAPACITY, PRIVATE_RATE),
      )
    }
    return this.buckets.get(jid)!
  }

  /**
   * Encola un envío con prioridad. NO consume tokens: los límites los aplica
   * el embudo (directForJid) sobre cada sock.sendMessage. Lo que aporta la
   * cola es el orden —urgent antes que broadcast— y un envío a la vez, para
   * que un broadcast masivo no se intercale con respuestas a comandos.
   */
  enqueue(
    jid:      string,
    fn:       () => Promise<any>,
    priority: 'urgent' | 'normal' | 'broadcast' = 'normal',
  ): Promise<any> {
    const p: 0 | 1 | 2 = priority === 'urgent' ? 0 : priority === 'normal' ? 1 : 2
    return new Promise<any>((resolve, reject) => {
      const item: QueueItem = { jid, fn, resolve, reject, priority: p }
      if (p === 0) {
        this.queue.unshift(item)
      } else {
        this.queue.push(item)
      }
      this._run()
    })
  }

  /**
   * ÚNICO punto donde se consumen tokens. Lo llama el embudo de salida
   * (core/egress.ts) por cada sock.sendMessage, venga de donde venga: aplica
   * el techo global, el bucket del chat destino y el retraso mínimo.
   *
   * El límite por chat es el que evita floodear un grupo concreto —3 de ráfaga
   * y 1/s en grupos, 2 y uno cada 4s en privado— y hasta el embudo casi nunca
   * llegaba a aplicarse: el 62% de los envíos iban por `sock.sendMessage`
   * directo sin ningún control, y el resto por safeSend, que solo miraba el
   * bucket global.
   *
   * No encola: espera su turno y sale. Encolar respuestas a comandos añadiría
   * latencia y podría reordenarlas.
   */
  async directForJid(jid: string, fn: () => Promise<any>): Promise<any> {
    while (!this.global.tryConsume()) {
      await sleep(this.global.waitMs())
    }
    if (jid) {
      const bkt = this.bucket(jid)
      while (!bkt.tryConsume()) {
        await sleep(bkt.waitMs())
      }
    }

    // El turno se RESERVA antes de dormir, no después.
    //
    // La versión anterior hacía "leer lastSend → dormir la diferencia →
    // escribir lastSend", y con envíos concurrentes (que es el caso normal:
    // varios grupos respondiendo a la vez) dos llamadas leían el mismo
    // lastSend antes de que ninguna lo actualizara, dormían lo mismo y salían
    // en el MISMO milisegundo — el retraso mínimo no se aplicaba justo en las
    // ráfagas, que es cuando hace falta. Confirmado midiendo: seis envíos
    // concurrentes salían dos a dos con 0 ms de separación.
    //
    // Reservando primero, cada llamada se agenda después de la anterior y la
    // secuencia queda escalonada de verdad.
    const now       = Date.now()
    const scheduled = Math.max(now, this.lastSend + MIN_DELAY_MS)
    this.lastSend   = scheduled
    const wait      = scheduled - now
    if (wait > 0) await sleep(wait)

    return withSendTimeout(fn)
  }

  private async _run(): Promise<void> {
    if (this.running) return
    this.running = true

    while (this.queue.length > 0) {
      const item = this.queue.shift()!

      // Acá NO se consumen tokens. Desde que existe el embudo de salida
      // (core/egress.ts), los buckets —global y por-JID— los aplica
      // directForJid() sobre CADA sock.sendMessage, venga de donde venga. Si
      // esta cola también los consumiera, un broadcast pagaría el límite dos
      // veces y saldría a la mitad de la velocidad permitida.
      //
      // Lo que esta cola sigue aportando, y por eso no desaparece: orden por
      // prioridad (urgent antes que broadcast) y un envío a la vez, para que
      // un broadcast masivo no se intercale con las respuestas a comandos.
      try {
        item.resolve(await withSendTimeout(item.fn))
      } catch (err: any) {
        const msg = String(err?.message ?? err ?? '')
        if (
          msg.includes('rate') ||
          msg.includes('429')  ||
          msg.includes('slow') ||
          msg.includes('Retry after')
        ) {
          // WhatsApp pidió bajar la velocidad — drenar bucket y esperar
          this.global.drain()
          await sleep(RATE_BACKOFF_MS)
        }
        item.reject(err)
      }
    }

    this.running = false
  }

  /** Liberar buckets de JIDs inactivos para evitar leak de memoria. */
  trim(): void {
    if (this.buckets.size > 2_000) {
      let removed = 0
      for (const k of this.buckets.keys()) {
        this.buckets.delete(k)
        if (++removed >= 1_000) break
      }
    }
  }

  get queueLength(): number { return this.queue.length }
}

export const rateLimiter = new WinsiRateLimiter()
setInterval(() => rateLimiter.trim(), 10 * 60_000).unref()
