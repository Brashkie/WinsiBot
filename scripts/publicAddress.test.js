// #fetch no le pide nada a la propia máquina ni a la red local (src/lib/publicAddress.ts).
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { esPublica, lookupPublico, motivoParaNoPedir } from '../src/lib/publicAddress.ts'

describe('esPublica', () => {
  it('internas: la máquina, la red local, la nube', () => {
    for (const ip of ['127.0.0.1', '127.8.8.8', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
      '169.254.169.254', '100.64.0.1', '0.0.0.0', '255.255.255.255', '224.0.0.1',
      '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::FFFF:10.0.0.1', '64:ff9b::a00:1']) {
      expect(esPublica(ip), ip).toBe(false)
    }
  })

  it('públicas', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(esPublica(ip), ip).toBe(true)
    }
  })

  it('lo que no es una IP, no', () => {
    expect(esPublica('localhost')).toBe(false)
    expect(esPublica('')).toBe(false)
  })
})

describe('motivoParaNoPedir', () => {
  it('rechaza IPs internas escritas en la URL, en cualquier forma', () => {
    for (const u of ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::1]:4001/',
      'http://169.254.169.254/latest/meta-data/', 'http://localhost:4001/', 'http://a.localhost/',
      'file:///etc/passwd', 'ftp://x.com/', 'no es url']) {
      expect(motivoParaNoPedir(u), u).not.toBeNull()
    }
  })

  it('deja pasar lo público', () => {
    expect(motivoParaNoPedir('https://api.github.com/')).toBeNull()
    expect(motivoParaNoPedir('http://8.8.8.8/')).toBeNull()
  })
})

describe('lookupPublico', () => {
  it('no deja conectar por nombre a algo que resuelve a la propia máquina', async () => {
    const srv = createServer((_, res) => res.end('secreto'))
    await new Promise((r) => srv.listen(0, '127.0.0.1', r))
    const { port } = srv.address()
    try {
      // `localhost` resuelve a 127.0.0.1: el lookup lo corta al conectar.
      const err = await axios
        .get(`http://localhost:${port}/`, { lookup: lookupPublico, timeout: 3000, family: 4 })
        .then(() => null, (e) => e)
      expect(err).not.toBeNull()
      expect(String(err?.code ?? err?.message)).toMatch(/interna|EINTERNA/)
      // Sin el lookup, el servidor sí responde: el bloqueo es el lookup.
      expect((await axios.get(`http://127.0.0.1:${port}/`)).data).toBe('secreto')
    } finally {
      srv.close()
    }
  })
})
