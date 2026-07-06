/// cacheManager.ts — Cache genérico con TTL para todo WinsiBot.
///
/// No borra todo cada cierto tiempo: cada entrada expira por su cuenta (TTL),
/// y un sweep periódico solo elimina lo que ya venció. Si se llega al tamaño
/// máximo, se descarta la entrada menos usada (LFU simple) antes de insertar.
///
/// Uso:
///   const groupCache = createCache<GroupMeta>({ ttl: 5 * 60_000, maxSize: 500 })
///   groupCache.set(jid, metadata)
///   groupCache.get(jid)              // undefined si no existe o expiró
///   groupCache.stats()               // { size, hits, misses }

interface CacheEntry<T> {
  value:     T
  expiresAt: number
  hits:      number
}

export interface CacheOptions {
  ttl?:          number  // ms — default 5 min
  maxSize?:      number  // default 1000
  sweepEvery?:   number  // ms — default 60s
}

export interface CacheStats {
  size:   number
  hits:   number
  misses: number
}

export class Cache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>()
  private hitCount  = 0
  private missCount = 0
  private readonly defaultTtl: number
  private readonly maxSize:    number
  private readonly sweepTimer: NodeJS.Timeout

  constructor(opts: CacheOptions = {}) {
    this.defaultTtl = opts.ttl     ?? 5 * 60_000
    this.maxSize     = opts.maxSize ?? 1000
    this.sweepTimer  = setInterval(() => this.sweep(), opts.sweepEvery ?? 60_000).unref()
  }

  set(key: string, value: T, opts: { ttl?: number } = {}): void {
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      this.evictLeastUsed()
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (opts.ttl ?? this.defaultTtl),
      hits:      0,
    })
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) { this.missCount++; return undefined }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      this.missCount++
      return undefined
    }
    entry.hits++
    this.hitCount++
    return entry.value
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (entry.expiresAt <= Date.now()) { this.store.delete(key); return false }
    return true
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  /** Vacía todo — para un comando de "limpiar caché". */
  clear(): void {
    this.store.clear()
    this.hitCount   = 0
    this.missCount  = 0
  }

  stats(): CacheStats {
    return { size: this.store.size, hits: this.hitCount, misses: this.missCount }
  }

  /** Elimina solo las entradas vencidas — se llama sola cada sweepEvery ms. */
  private sweep(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key)
    }
  }

  private evictLeastUsed(): void {
    let leastKey: string | null = null
    let leastHits = Infinity
    for (const [key, entry] of this.store) {
      if (entry.hits < leastHits) {
        leastHits = entry.hits
        leastKey  = key
        if (leastHits === 0) break // no se puede usar menos que cero
      }
    }
    if (leastKey) this.store.delete(leastKey)
  }
}

export function createCache<T = unknown>(opts?: CacheOptions): Cache<T> {
  return new Cache<T>(opts)
}

// ─── Registro global — para que un comando "limpiar caché" pueda barrer todo ─
const registry = new Map<string, Cache<any>>()

export function registerCache<T>(name: string, cache: Cache<T>): Cache<T> {
  registry.set(name, cache)
  return cache
}

export function getAllCacheStats(): Record<string, CacheStats> {
  const out: Record<string, CacheStats> = {}
  for (const [name, cache] of registry) out[name] = cache.stats()
  return out
}

export function clearAllCaches(): string[] {
  const names = [...registry.keys()]
  for (const cache of registry.values()) cache.clear()
  return names
}

export function clearCache(name: string): boolean {
  const cache = registry.get(name)
  if (!cache) return false
  cache.clear()
  return true
}
