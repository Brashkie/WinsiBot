// De qué país es un número, por su prefijo internacional. Lógica pura: la usa
// #paises, y la va a usar el idioma por defecto de cada usuario (un +55
// escribe en portugués). Se prueba desde scripts/countries.test.js.
//
// Se busca el prefijo MÁS LARGO que coincida: +1 es Estados Unidos y Canadá,
// pero +1 809 es República Dominicana; +7 es Rusia, +77 Kazajistán.

export interface Pais {
  iso:    string   // ISO 3166-1 alfa-2
  nombre: string
  idioma: string   // el principal, ISO 639-1
}

// prefijo → país. Los del Plan de Numeración de Norteamérica (+1 XXX) van con
// su código de área de tres dígitos.
const TABLA: Record<string, Pais> = {
  // América
  '1':    { iso: 'US', nombre: 'EE. UU. / Canadá', idioma: 'en' },
  '1787': { iso: 'PR', nombre: 'Puerto Rico', idioma: 'es' },
  '1939': { iso: 'PR', nombre: 'Puerto Rico', idioma: 'es' },
  '1809': { iso: 'DO', nombre: 'República Dominicana', idioma: 'es' },
  '1829': { iso: 'DO', nombre: 'República Dominicana', idioma: 'es' },
  '1849': { iso: 'DO', nombre: 'República Dominicana', idioma: 'es' },
  '1876': { iso: 'JM', nombre: 'Jamaica', idioma: 'en' },
  '1868': { iso: 'TT', nombre: 'Trinidad y Tobago', idioma: 'en' },
  '52':   { iso: 'MX', nombre: 'México', idioma: 'es' },
  '53':   { iso: 'CU', nombre: 'Cuba', idioma: 'es' },
  '54':   { iso: 'AR', nombre: 'Argentina', idioma: 'es' },
  '55':   { iso: 'BR', nombre: 'Brasil', idioma: 'pt' },
  '56':   { iso: 'CL', nombre: 'Chile', idioma: 'es' },
  '57':   { iso: 'CO', nombre: 'Colombia', idioma: 'es' },
  '58':   { iso: 'VE', nombre: 'Venezuela', idioma: 'es' },
  '51':   { iso: 'PE', nombre: 'Perú', idioma: 'es' },
  '591':  { iso: 'BO', nombre: 'Bolivia', idioma: 'es' },
  '593':  { iso: 'EC', nombre: 'Ecuador', idioma: 'es' },
  '595':  { iso: 'PY', nombre: 'Paraguay', idioma: 'es' },
  '598':  { iso: 'UY', nombre: 'Uruguay', idioma: 'es' },
  '502':  { iso: 'GT', nombre: 'Guatemala', idioma: 'es' },
  '503':  { iso: 'SV', nombre: 'El Salvador', idioma: 'es' },
  '504':  { iso: 'HN', nombre: 'Honduras', idioma: 'es' },
  '505':  { iso: 'NI', nombre: 'Nicaragua', idioma: 'es' },
  '506':  { iso: 'CR', nombre: 'Costa Rica', idioma: 'es' },
  '507':  { iso: 'PA', nombre: 'Panamá', idioma: 'es' },
  '509':  { iso: 'HT', nombre: 'Haití', idioma: 'fr' },
  // Europa
  '34':   { iso: 'ES', nombre: 'España', idioma: 'es' },
  '351':  { iso: 'PT', nombre: 'Portugal', idioma: 'pt' },
  '33':   { iso: 'FR', nombre: 'Francia', idioma: 'fr' },
  '39':   { iso: 'IT', nombre: 'Italia', idioma: 'it' },
  '49':   { iso: 'DE', nombre: 'Alemania', idioma: 'de' },
  '44':   { iso: 'GB', nombre: 'Reino Unido', idioma: 'en' },
  '353':  { iso: 'IE', nombre: 'Irlanda', idioma: 'en' },
  '31':   { iso: 'NL', nombre: 'Países Bajos', idioma: 'nl' },
  '32':   { iso: 'BE', nombre: 'Bélgica', idioma: 'fr' },
  '41':   { iso: 'CH', nombre: 'Suiza', idioma: 'de' },
  '43':   { iso: 'AT', nombre: 'Austria', idioma: 'de' },
  '45':   { iso: 'DK', nombre: 'Dinamarca', idioma: 'da' },
  '46':   { iso: 'SE', nombre: 'Suecia', idioma: 'sv' },
  '47':   { iso: 'NO', nombre: 'Noruega', idioma: 'no' },
  '48':   { iso: 'PL', nombre: 'Polonia', idioma: 'pl' },
  '30':   { iso: 'GR', nombre: 'Grecia', idioma: 'el' },
  '40':   { iso: 'RO', nombre: 'Rumania', idioma: 'ro' },
  '380':  { iso: 'UA', nombre: 'Ucrania', idioma: 'uk' },
  '7':    { iso: 'RU', nombre: 'Rusia', idioma: 'ru' },
  '77':   { iso: 'KZ', nombre: 'Kazajistán', idioma: 'kk' },
  '90':   { iso: 'TR', nombre: 'Turquía', idioma: 'tr' },
  // África y Medio Oriente
  '20':   { iso: 'EG', nombre: 'Egipto', idioma: 'ar' },
  '212':  { iso: 'MA', nombre: 'Marruecos', idioma: 'ar' },
  '213':  { iso: 'DZ', nombre: 'Argelia', idioma: 'ar' },
  '216':  { iso: 'TN', nombre: 'Túnez', idioma: 'ar' },
  '234':  { iso: 'NG', nombre: 'Nigeria', idioma: 'en' },
  '240':  { iso: 'GQ', nombre: 'Guinea Ecuatorial', idioma: 'es' },
  '244':  { iso: 'AO', nombre: 'Angola', idioma: 'pt' },
  '258':  { iso: 'MZ', nombre: 'Mozambique', idioma: 'pt' },
  '27':   { iso: 'ZA', nombre: 'Sudáfrica', idioma: 'en' },
  '254':  { iso: 'KE', nombre: 'Kenia', idioma: 'en' },
  '966':  { iso: 'SA', nombre: 'Arabia Saudita', idioma: 'ar' },
  '971':  { iso: 'AE', nombre: 'Emiratos Árabes', idioma: 'ar' },
  '972':  { iso: 'IL', nombre: 'Israel', idioma: 'he' },
  '98':   { iso: 'IR', nombre: 'Irán', idioma: 'fa' },
  // Asia y Oceanía
  '91':   { iso: 'IN', nombre: 'India', idioma: 'hi' },
  '92':   { iso: 'PK', nombre: 'Pakistán', idioma: 'ur' },
  '880':  { iso: 'BD', nombre: 'Bangladés', idioma: 'bn' },
  '86':   { iso: 'CN', nombre: 'China', idioma: 'zh' },
  '81':   { iso: 'JP', nombre: 'Japón', idioma: 'ja' },
  '82':   { iso: 'KR', nombre: 'Corea del Sur', idioma: 'ko' },
  '62':   { iso: 'ID', nombre: 'Indonesia', idioma: 'id' },
  '60':   { iso: 'MY', nombre: 'Malasia', idioma: 'ms' },
  '63':   { iso: 'PH', nombre: 'Filipinas', idioma: 'en' },
  '66':   { iso: 'TH', nombre: 'Tailandia', idioma: 'th' },
  '84':   { iso: 'VN', nombre: 'Vietnam', idioma: 'vi' },
  '61':   { iso: 'AU', nombre: 'Australia', idioma: 'en' },
  '64':   { iso: 'NZ', nombre: 'Nueva Zelanda', idioma: 'en' },
}

const LARGO_MAX = Math.max(...Object.keys(TABLA).map(k => k.length))

/** Los dígitos de un jid o número: "+51 999…", "51999…@s.whatsapp.net". */
export const digitos = (s: string) => s.split('@')[0]!.split(':')[0]!.replace(/\D/g, '')

/** El país de un número con su código internacional, o null si no se reconoce. */
export function paisDe(numero: string): (Pais & { prefijo: string }) | null {
  const d = digitos(numero)
  for (let n = Math.min(LARGO_MAX, d.length); n >= 1; n--) {
    const p = TABLA[d.slice(0, n)]
    if (p) return { ...p, prefijo: d.slice(0, n) }
  }
  return null
}

/** 🇵🇪 a partir de "PE": dos letras indicadoras regionales. */
export function bandera(iso: string): string {
  return [...iso.toUpperCase()].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')
}

/** Cuántos hay de cada país, del más al menos frecuente. */
export function contarPaises(numeros: string[]): { pais: Pais | null; cantidad: number }[] {
  const por = new Map<string, { pais: Pais | null; cantidad: number }>()
  for (const n of numeros) {
    const p = paisDe(n)
    const k = p ? p.iso + p.nombre : '?'
    const actual = por.get(k) ?? { pais: p ? { iso: p.iso, nombre: p.nombre, idioma: p.idioma } : null, cantidad: 0 }
    actual.cantidad++
    por.set(k, actual)
  }
  // Los que no se reconocen, siempre al final; el resto, del más frecuente.
  return [...por.values()].sort((a, b) =>
    Number(a.pais === null) - Number(b.pais === null) ||
    b.cantidad - a.cantidad ||
    (a.pais?.nombre ?? '').localeCompare(b.pais?.nombre ?? ''))
}
