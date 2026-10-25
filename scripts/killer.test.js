// Las reglas de "Asesino en el chat" (ver src/lib/killer.ts).
import { describe, expect, it } from 'vitest'
import { repartir, resolverNoche, contarVotos, ganador, puedeSalvar } from '../src/lib/killer.ts'

const cuenta = (roles, r) => roles.filter(x => x === r).length

describe('repartir', () => {
  it('un asesino hasta 7, dos desde 8; médico desde 5; siempre un detective', () => {
    for (let n = 4; n <= 10; n++) {
      const roles = repartir(n)
      expect(roles).toHaveLength(n)
      expect(cuenta(roles, 'asesino')).toBe(n >= 8 ? 2 : 1)
      expect(cuenta(roles, 'detective')).toBe(1)
      expect(cuenta(roles, 'medico')).toBe(n >= 5 ? 1 : 0)
    }
  })

  it('cualquiera puede ser el asesino', () => {
    const asientos = new Set()
    for (let i = 0; i < 500; i++) asientos.add(repartir(6).indexOf('asesino'))
    expect(asientos.size).toBe(6)
  })

  it('con 4 a 10 jugadores, la partida nunca está decidida antes de empezar', () => {
    for (let n = 4; n <= 10; n++) {
      const roles = repartir(n)
      expect(ganador(roles, new Set(roles.map((_, i) => i + 1)))).toBeNull()
    }
  })
})

describe('resolverNoche', () => {
  it('muere el elegido, salvo que el médico lo salve', () => {
    expect(resolverNoche([3], null)).toBe(3)
    expect(resolverNoche([3], 3)).toBeNull()
    expect(resolverNoche([3], 2)).toBe(3)
  })

  it('sin elección del asesino, no muere nadie', () => {
    expect(resolverNoche([], null)).toBeNull()
  })

  it('dos asesinos que eligen distinto: uno de los dos', () => {
    const vistos = new Set()
    for (let i = 0; i < 200; i++) vistos.add(resolverNoche([2, 5], null))
    expect([...vistos].sort()).toEqual([2, 5])
  })
})

describe('contarVotos', () => {
  const votos = (pares) => new Map(pares)
  it('el más votado', () => {
    expect(contarVotos(votos([[1, 3], [2, 3], [4, 1]])).expulsado).toBe(3)
  })
  it('empate: nadie', () => {
    expect(contarVotos(votos([[1, 3], [2, 4]])).expulsado).toBeNull()
  })
  it('si gana "no expulsar" (0), nadie', () => {
    expect(contarVotos(votos([[1, 0], [2, 0], [3, 4]])).expulsado).toBeNull()
  })
  it('sin votos, nadie', () => {
    expect(contarVotos(new Map()).expulsado).toBeNull()
  })
})

describe('ganador', () => {
  const roles = ['asesino', 'detective', 'medico', 'ciudadano', 'ciudadano']
  it('sin asesinos vivos gana el pueblo', () => {
    expect(ganador(roles, new Set([2, 3, 4]))).toBe('pueblo')
  })
  it('si los asesinos son tantos como el resto, ganan ellos', () => {
    expect(ganador(roles, new Set([1, 4]))).toBe('asesinos')
  })
  it('si no, sigue', () => {
    expect(ganador(roles, new Set([1, 2, 4]))).toBeNull()
  })
})

describe('puedeSalvar', () => {
  it('no a la misma persona dos noches seguidas', () => {
    expect(puedeSalvar(3, 3)).toBe(false)
    expect(puedeSalvar(3, null)).toBe(true)
    expect(puedeSalvar(3, 2)).toBe(true)
  })
})
