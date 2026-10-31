// El antirrobo, del lado del bot (src/lib/groupGuard.ts): describir el evento
// como lo pide la decisión de Ada/SPARK. Lo que la demostración de GNATprove
// no cubre es justo esto —que el bot le pase las banderas correctas—, y lo que
// más se presta a error son los @lid: la misma persona con dos nombres.
import { describe, expect, it } from 'vitest'
import { aliasDe, BANDERA, banderas, esLaMisma, normalizar, tipoDe } from '../src/lib/groupGuard.ts'

const DUENO_PN = '51911111111@s.whatsapp.net'
const DUENO_LID = '111111@lid'
const ATACANTE_LID = '222222@lid'
const ATACANTE_PN = '51922222222@s.whatsapp.net'
const BOT_PN = '51900000000@s.whatsapp.net'
const BOT_LID = '999999@lid'

// Un grupo con addressingMode 'lid': `id` es el @lid y `jid` el número.
const grupo = [
  { id: DUENO_LID, jid: DUENO_PN },
  { id: ATACANTE_LID, jid: ATACANTE_PN },
  { id: BOT_LID, jid: BOT_PN },
]

const base = {
  activo: true,
  protegidos: [DUENO_PN],
  bot: [`51900000000:7@s.whatsapp.net`, BOT_LID],
  botEsAdmin: true,
}

describe('quién es quién', () => {
  it('el jid sin dispositivo', () => {
    expect(normalizar('51900000000:7@s.whatsapp.net')).toBe(BOT_PN)
    expect(normalizar(' 111111@LID ')).toBe(DUENO_LID)
  })

  it('el número y el @lid de alguien son la misma persona', () => {
    expect(esLaMisma(DUENO_LID, DUENO_PN, grupo)).toBe(true)
    expect(esLaMisma(DUENO_LID, ATACANTE_PN, grupo)).toBe(false)
    expect(aliasDe(DUENO_PN, grupo).sort()).toEqual([DUENO_LID, DUENO_PN])
  })

  it('sin datos, no es nadie', () => {
    expect(esLaMisma(undefined, DUENO_PN, grupo)).toBe(false)
    expect(esLaMisma(DUENO_PN, '', grupo)).toBe(false)
    // Alguien que ya no está en el grupo solo se reconoce por su propio nombre.
    expect(esLaMisma('5100@s.whatsapp.net', '5100@s.whatsapp.net', grupo)).toBe(true)
  })

  it('los tipos de Ada', () => {
    expect(['promote', 'demote', 'remove', 'add', 'modify'].map(tipoDe)).toEqual([0, 1, 2, -1, -1])
  })
})

describe('las banderas del evento', () => {
  it('el ataque típico, con el autor y el afectado como @lid', () => {
    const f = banderas({ ...base, autor: ATACANTE_LID, afectado: DUENO_LID }, grupo)
    expect(f).toBe(
      BANDERA.activo | BANDERA.autorConocido | BANDERA.afectadoProtegido | BANDERA.botEsAdmin,
    )
  })

  it('el dueño, aunque llegue como @lid, es protegido', () => {
    const f = banderas({ ...base, autor: DUENO_LID, afectado: ATACANTE_LID }, grupo)
    expect(f & BANDERA.autorProtegido).toBeTruthy()
  })

  it('sacar al bot, con el dispositivo en su número', () => {
    const f = banderas({ ...base, autor: ATACANTE_PN, afectado: BOT_LID }, grupo)
    expect(f & BANDERA.afectadoEsBot).toBeTruthy()
    expect(f & BANDERA.afectadoProtegido).toBeFalsy()
  })

  it('las acciones del propio bot no son de un atacante', () => {
    const f = banderas({ ...base, autor: BOT_PN, afectado: ATACANTE_LID }, grupo)
    expect(f & BANDERA.autorEsBot).toBeTruthy()
  })

  it('irse solo', () => {
    const f = banderas({ ...base, autor: DUENO_PN, afectado: DUENO_LID }, grupo)
    expect(f & BANDERA.autorEsAfectado).toBeTruthy()
  })

  it('sin autor, no hay autor conocido ni nada de él', () => {
    const f = banderas({ ...base, autor: undefined, afectado: DUENO_LID }, grupo)
    expect(
      f &
        (BANDERA.autorConocido |
          BANDERA.autorProtegido |
          BANDERA.autorEsBot |
          BANDERA.autorEsAfectado),
    ).toBe(0)
  })
})
