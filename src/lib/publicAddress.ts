// Si una IP es de internet o de adentro. Lo usa #fetch para no pedirle nada a
// la propia máquina ni a la red local: la Session API y el panel escuchan en
// localhost, y en una nube 169.254.169.254 entrega las credenciales de la
// máquina a quien se lo pida desde ella.
//
// Sin alias de importación, para poder probarlo.

import type { LookupAddress } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns'
import { BlockList, isIP } from 'node:net'

const internas = new BlockList()
for (const [red, bits] of [
  ['0.0.0.0', 8], // "esta red"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // NAT de operador
  ['127.0.0.0', 8], // la propia máquina
  ['169.254.0.0', 16], // enlace local, y los metadatos de la nube
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24],
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // pruebas
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada, y 255.255.255.255
] as const) {
  internas.addSubnet(red, bits, 'ipv4')
}
for (const [red, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // privada
  ['fe80::', 10], // enlace local
  ['ff00::', 8], // multicast
  ['64:ff9b::', 96], // NAT64: lleva una IPv4 adentro
] as const) {
  internas.addSubnet(red, bits, 'ipv6')
}

export function esPublica(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return !internas.check(ip, 'ipv4')
  if (v === 6) {
    // `::ffff:10.0.0.1` es una IPv4 escrita como IPv6: se mira la de adentro.
    const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
    if (mapeada) return esPublica(mapeada[1]!)
    return !internas.check(ip, 'ipv6')
  }
  return false
}

type Callback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/**
 * Un `lookup` para http/axios que solo deja conectar a IPs públicas. Se revisa
 * la dirección con la que de verdad se conecta, no una resuelta antes: si no,
 * un dominio podría dar una IP pública al revisarlo y una interna al conectar.
 */
export function lookupPublico(host: string, opciones: object, cb: Callback): void {
  dnsLookup(host, { ...opciones, all: true }, (err, direcciones) => {
    if (err) return cb(err, [])
    const lista = direcciones as LookupAddress[]
    const mala = lista.find((d) => !esPublica(d.address))
    if (mala || lista.length === 0) {
      const e: NodeJS.ErrnoException = new Error(`${host} apunta a una dirección interna (${mala?.address ?? 'ninguna'})`)
      e.code = 'EINTERNA'
      return cb(e, [])
    }
    if ((opciones as { all?: boolean }).all) return cb(null, lista)
    cb(null, lista[0]!.address, lista[0]!.family)
  })
}

/**
 * Por qué no se puede pedir esa URL, o null si se puede. Una IP escrita en la
 * URL no pasa por el lookup —no hay nada que resolver—, así que se revisa
 * acá. El parser de URL ya lleva a `127.0.0.1` las formas raras como
 * `2130706433` o `0x7f.1`.
 */
export function motivoParaNoPedir(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'no es una URL válida'
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'solo http y https'
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !esPublica(host)) return `${host} es una dirección interna`
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost es la propia máquina'
  return null
}
