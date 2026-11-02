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
// guion bajo, el mismo en toda la tira y cada tres cifras exactas), hasta
// `Number.MAX_SAFE_INTEGER` y hasta 32 caracteres. Lo demás es `NaN`, así que
// los `Number.isNaN(monto)` que ya tenía cada comando siguen diciendo "monto
// inválido" sin tocar su lógica.
//
// La regla está demostrada en Ada/SPARK (crates/session-api/ada/src/
// amount_parser.ads): GNATprove prueba que acepta exactamente esa gramática y
// que el valor es exactamente el de esos dígitos. Esto es una copia, línea
// por línea, para leer en el mismo paso que el comando —ir a la Session API
// por cada monto sumaría un viaje—, y scripts/amount.test.js la ata a Ada:
// recorre las mismas 2.396.745 tiras que el test de Rust y tiene que dar la
// misma huella.

export const MAX_LARGO = 32

const esDigito = (c: number) => c >= 48 && c <= 57
// . , _ y espacio.
const esSeparador = (c: number) => c === 46 || c === 44 || c === 95 || c === 32

export function montoDe(texto: string | undefined | null): number {
  const t = (texto ?? '').trim()
  const n = t.length
  if (n === 0 || n > MAX_LARGO) return Number.NaN

  let soloDigitos = true
  for (let i = 0; i < n; i++) {
    if (!esDigito(t.charCodeAt(i))) {
      soloDigitos = false
      break
    }
  }
  if (!soloDigitos) {
    // Con miles: un primer grupo de 1 a 3 cifras (k = n mod 4) y después
    // grupos de separador + 3 cifras, con el separador siempre el mismo.
    const k = n % 4
    if (n < 5 || k === 0) return Number.NaN
    const sep = t.charCodeAt(k)
    if (!esSeparador(sep)) return Number.NaN
    for (let i = 0; i < n; i++) {
      const c = t.charCodeAt(i)
      if (i >= k && (i - k) % 4 === 0 ? c !== sep : !esDigito(c)) return Number.NaN
    }
  }

  let v = 0
  for (let i = 0; i < n; i++) {
    const c = t.charCodeAt(i)
    if (esDigito(c)) {
      // Si se pasa, la cuenta deja de ser exacta pero nunca vuelve a bajar
      // del máximo: alcanza para saber que se pasó.
      v = v * 10 + (c - 48)
      if (v > Number.MAX_SAFE_INTEGER) return Number.NaN
    }
  }
  return v
}
