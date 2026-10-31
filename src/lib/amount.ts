// Leer un monto que escribe alguien: #pay 1.000, #bank 500, #coinflip cara 2k…
//
// Antes cada comando de economía hacía `parseInt`, que es demasiado permisivo
// para dinero:
//
// - `1.000` daba **1**: se corta en el punto, y en español el punto separa
//   los miles. `#pay @x 1.000` pagaba un yen;
// - una tira de 400 dígitos daba `Infinity`, que pasa `isNaN` y cualquier
//   mínimo. Lo frenaba solo el chequeo de saldo, de casualidad;
// - `12abc` daba 12, `0x10` daba 16 y `1e9` daba 1.
//
// Ahora: solo dígitos, con o sin separador de miles (punto, coma, espacio o
// guion bajo cada tres cifras), hasta `Number.MAX_SAFE_INTEGER`. Lo demás es
// `NaN`, así que los `Number.isNaN(monto)` que ya tenía cada comando siguen
// diciendo "monto inválido" sin tocar su lógica.
//
// Lógica pura: se prueba desde scripts/amount.test.js.

const MILES = /^\d{1,3}([.,_ ]\d{3})+$/
const DIGITOS = /^\d+$/

export function montoDe(texto: string | undefined | null): number {
  const t = (texto ?? '').trim()
  if (!DIGITOS.test(t) && !MILES.test(t)) return Number.NaN
  // Con separadores, tienen que ser todos el mismo: "1.000,000" no es un monto.
  const seps = new Set(t.replace(/\d/g, ''))
  if (seps.size > 1) return Number.NaN
  const n = Number(t.replace(/[.,_ ]/g, ''))
  return Number.isSafeInteger(n) ? n : Number.NaN
}
