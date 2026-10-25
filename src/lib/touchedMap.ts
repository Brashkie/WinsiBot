/**
 * Un Map que anota qué claves se pidieron desde el último guardado.
 *
 * Para qué: el guardado periódico (persistence.ts) serializaba y hasheaba a
 * TODOS los usuarios cada 30 s solo para averiguar quién había cambiado. Con
 * los 2557 de una cuenta real eran 16 ms de CPU por ciclo —el event loop
 * parado— y 46 s de CPU al día sin que nadie escribiera nada, creciendo con
 * cada usuario nuevo.
 *
 * Los usuarios se modifican en 111 sitios, casi siempre sobre el objeto que
 * devuelve getUserData(), así que no hay un punto único donde marcar "cambió".
 * Lo que sí hay es un punto único por donde se LLEGA al objeto: `get`, `set`,
 * o recorrer el mapa. Cualquiera de esos marca la clave como "pudo cambiar";
 * recorrerlo entero (los rankings) marca todas para ese ciclo. El guardado
 * compara el hash igual que antes, así que nunca escribe lo que no cambió, y
 * no se le puede escapar nada: lo que no se pidió, no se pudo modificar.
 */
export class MapConTocados<K, V> extends Map<K, V> {
  private tocadas = new Set<K>()
  private todas = true // al arrancar, revisar todo una vez

  override get(k: K): V | undefined {
    const v = super.get(k)
    if (v !== undefined) this.tocadas.add(k)
    return v
  }
  override set(k: K, v: V): this {
    this.tocadas?.add(k) // `?.`: el constructor de Map llama a set antes de inicializar los campos
    return super.set(k, v)
  }
  override entries(): MapIterator<[K, V]> {
    this.todas = true
    return super.entries()
  }
  override values(): MapIterator<V> {
    this.todas = true
    return super.values()
  }
  override forEach(fn: (v: V, k: K, m: Map<K, V>) => void, thisArg?: unknown): void {
    this.todas = true
    super.forEach(fn, thisArg)
  }
  override [Symbol.iterator](): MapIterator<[K, V]> {
    this.todas = true
    return super[Symbol.iterator]()
  }

  /** Lo que pudo cambiar desde la última vez, y vacía la marca. Leer acá NO marca nada. */
  tomarTocadas(): [K, V][] {
    const out: [K, V][] = []
    if (this.todas) {
      for (const e of Map.prototype.entries.call(this) as MapIterator<[K, V]>) out.push(e)
    } else {
      for (const k of this.tocadas) {
        const v = Map.prototype.get.call(this, k) as V | undefined
        if (v !== undefined) out.push([k, v])
      }
    }
    this.tocadas.clear()
    this.todas = false
    return out
  }
}
