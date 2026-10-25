// De qué país es un número (ver src/lib/countries.ts).
import { describe, expect, it } from 'vitest'
import { paisDe, bandera, contarPaises, digitos } from '../src/lib/countries.ts'

describe('paisDe', () => {
  it('reconoce por prefijo, de cualquier forma que venga el número', () => {
    expect(paisDe('51987654321@s.whatsapp.net')?.iso).toBe('PE')
    expect(paisDe('+55 11 91234-5678')?.idioma).toBe('pt')
    expect(paisDe('5215512345678')?.iso).toBe('MX')
    expect(paisDe('34612345678:12@s.whatsapp.net')?.iso).toBe('ES')
  })

  it('gana el prefijo más largo', () => {
    expect(paisDe('18095551234')?.iso).toBe('DO')   // +1 809, no +1
    expect(paisDe('12025551234')?.iso).toBe('US')
    expect(paisDe('77011234567')?.iso).toBe('KZ')   // +77, no +7
    expect(paisDe('79161234567')?.iso).toBe('RU')
    expect(paisDe('593991234567')?.iso).toBe('EC')  // +593, no +59…
  })

  it('lo desconocido es null', () => {
    expect(paisDe('999123')).toBeNull()
    expect(paisDe('')).toBeNull()
  })
})

describe('bandera y conteo', () => {
  it('la bandera sale del ISO', () => {
    expect(bandera('pe')).toBe('🇵🇪')
  })

  it('cuenta y ordena del más frecuente', () => {
    const r = contarPaises(['51911', '51922', '5511', '999', '51933'])
    expect(r[0]).toEqual({ pais: { iso: 'PE', nombre: 'Perú', idioma: 'es' }, cantidad: 3 })
    expect(r.at(-1).pais).toBeNull()
  })

  it('digitos ignora el dispositivo y el dominio', () => {
    expect(digitos('51999:3@s.whatsapp.net')).toBe('51999')
  })
})
