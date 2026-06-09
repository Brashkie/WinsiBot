// ─── Calculator Library ───────────────────────────────────────────────────────

export class BasicCalculator {
  add(a: number, b: number)      { return a + b }
  subtract(a: number, b: number) { return a - b }
  multiply(a: number, b: number) { return a * b }
  divide(a: number, b: number) {
    if (b === 0) throw new Error('División entre cero')
    return a / b
  }
  modulo(a: number, b: number) {
    if (b === 0) throw new Error('División entre cero')
    return a % b
  }
  power(base: number, exp: number)  { return Math.pow(base, exp) }
  sqrt(n: number) {
    if (n < 0) throw new Error('Raíz de número negativo')
    return Math.sqrt(n)
  }
  abs(n: number)        { return Math.abs(n) }
  round(n: number, d = 0) { return parseFloat(n.toFixed(d)) }
  floor(n: number)      { return Math.floor(n) }
  ceil(n: number)       { return Math.ceil(n) }
  factorial(n: number): number {
    if (n < 0 || !Number.isInteger(n)) throw new Error('Factorial solo para enteros >= 0')
    if (n === 0 || n === 1) return 1
    return n * this.factorial(n - 1)
  }
  percentage(value: number, pct: number) { return (value * pct) / 100 }
}

export class ScientificCalculator extends BasicCalculator {
  sin(deg: number)  { return Math.sin((deg * Math.PI) / 180) }
  cos(deg: number)  { return Math.cos((deg * Math.PI) / 180) }
  tan(deg: number)  { return Math.tan((deg * Math.PI) / 180) }
  asin(v: number)   { return (Math.asin(v) * 180) / Math.PI }
  acos(v: number)   { return (Math.acos(v) * 180) / Math.PI }
  atan(v: number)   { return (Math.atan(v) * 180) / Math.PI }
  log(n: number)    { return Math.log10(n) }
  ln(n: number)     { return Math.log(n) }
  log2(n: number)   { return Math.log2(n) }
  exp(n: number)    { return Math.exp(n) }
  cbrt(n: number)   { return Math.cbrt(n) }
  nthRoot(n: number, r: number) { return Math.pow(n, 1 / r) }
  gcd(a: number, b: number): number {
    a = Math.abs(a); b = Math.abs(b)
    while (b) { [a, b] = [b, a % b] }
    return a
  }
  lcm(a: number, b: number)  { return Math.abs(a * b) / this.gcd(a, b) }
  isPrime(n: number): boolean {
    if (n < 2) return false
    for (let i = 2, s = Math.sqrt(n); i <= s; i++) {
      if (n % i === 0) return false
    }
    return true
  }
  fibonacci(n: number): number {
    if (n <= 0) return 0
    if (n === 1) return 1
    let a = 0, b = 1
    for (let i = 2; i <= n; i++) [a, b] = [b, a + b]
    return b
  }
  toRadians(deg: number) { return (deg * Math.PI) / 180 }
  toDegrees(rad: number) { return (rad * 180) / Math.PI }
  readonly PI = Math.PI
  readonly E  = Math.E
}

// ─── Unit Converter ───────────────────────────────────────────────────────────

type LengthUnit      = 'mm'|'cm'|'m'|'km'|'in'|'ft'|'yd'|'mi'
type WeightUnit      = 'mg'|'g'|'kg'|'t'|'oz'|'lb'|'st'
type TemperatureUnit = 'C'|'F'|'K'
type SpeedUnit       = 'm/s'|'km/h'|'mph'|'knots'|'ft/s'
type AreaUnit        = 'mm2'|'cm2'|'m2'|'km2'|'in2'|'ft2'|'ac'|'ha'
type VolumeUnit      = 'ml'|'l'|'m3'|'fl_oz'|'cup'|'pt'|'qt'|'gal'
type TimeUnit        = 'ms'|'s'|'min'|'h'|'d'|'wk'|'mo'|'yr'
type EnergyUnit      = 'j'|'kj'|'cal'|'kcal'|'wh'|'kwh'|'btu'
type DataUnit        = 'b'|'kb'|'mb'|'gb'|'tb'|'pb'|'kib'|'mib'|'gib'|'tib'

const TO_M: Record<LengthUnit, number> = {
  mm:0.001, cm:0.01, m:1, km:1000, in:0.0254, ft:0.3048, yd:0.9144, mi:1609.344
}
const TO_KG: Record<WeightUnit, number> = {
  mg:1e-6, g:0.001, kg:1, t:1000, oz:0.0283495, lb:0.453592, st:6.35029
}
const TO_MS2: Record<SpeedUnit, number> = {
  'm/s':1, 'km/h':1/3.6, mph:0.44704, knots:0.514444, 'ft/s':0.3048
}
const TO_M2: Record<AreaUnit, number> = {
  mm2:1e-6, cm2:1e-4, m2:1, km2:1e6, in2:0.00064516, ft2:0.092903, ac:4046.86, ha:10000
}
const TO_L: Record<VolumeUnit, number> = {
  ml:0.001, l:1, m3:1000, fl_oz:0.0295735, cup:0.236588, pt:0.473176, qt:0.946353, gal:3.78541
}
const TO_S: Record<TimeUnit, number> = {
  ms:0.001, s:1, min:60, h:3600, d:86400, wk:604800, mo:2629800, yr:31557600
}
const TO_J: Record<EnergyUnit, number> = {
  j:1, kj:1000, cal:4.184, kcal:4184, wh:3600, kwh:3600000, btu:1055.06
}
const TO_BITS: Record<DataUnit, number> = {
  b:1, kb:1000, mb:1e6, gb:1e9, tb:1e12, pb:1e15,
  kib:1024, mib:1048576, gib:1073741824, tib:1099511627776
}

export class UnitConverter {
  length(v: number, from: LengthUnit, to: LengthUnit)           { return v * TO_M[from]   / TO_M[to] }
  weight(v: number, from: WeightUnit, to: WeightUnit)           { return v * TO_KG[from]  / TO_KG[to] }
  speed(v: number, from: SpeedUnit, to: SpeedUnit)              { return v * TO_MS2[from] / TO_MS2[to] }
  area(v: number, from: AreaUnit, to: AreaUnit)                 { return v * TO_M2[from]  / TO_M2[to] }
  volume(v: number, from: VolumeUnit, to: VolumeUnit)           { return v * TO_L[from]   / TO_L[to] }
  time(v: number, from: TimeUnit, to: TimeUnit)                 { return v * TO_S[from]   / TO_S[to] }
  energy(v: number, from: EnergyUnit, to: EnergyUnit)          { return v * TO_J[from]   / TO_J[to] }
  data(v: number, from: DataUnit, to: DataUnit)                 { return v * TO_BITS[from]/ TO_BITS[to] }

  temperature(v: number, from: TemperatureUnit, to: TemperatureUnit): number {
    if (from === to) return v
    let celsius = v
    if (from === 'F') celsius = (v - 32) * 5/9
    else if (from === 'K') celsius = v - 273.15
    if (to === 'C') return celsius
    if (to === 'F') return celsius * 9/5 + 32
    return celsius + 273.15
  }
}

// ─── Expression Evaluator ─────────────────────────────────────────────────────

const SAFE_EXPR = /^[\d+\-*/^().%, \t]+$/

export class ExpressionEvaluator {
  private calc = new ScientificCalculator()

  evaluate(expr: string): number {
    const cleaned = expr
      .replace(/\s+/g, '')
      .replace(/\^/g, '**')
      .replace(/(\d+)%/g, (_, n) => `(${n}/100)`)

    if (!SAFE_EXPR.test(expr.replace(/\*\*/g, '^'))) {
      throw new Error('Expresión inválida')
    }

    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${cleaned})`)() as number
      if (!isFinite(result)) throw new Error('Resultado infinito o inválido')
      return result
    } catch {
      throw new Error('No se pudo evaluar la expresión')
    }
  }

  solve(expr: string): string {
    const result = this.evaluate(expr)
    return `${expr} = ${parseFloat(result.toFixed(10))}`
  }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export class StatisticsCalculator {
  mean(nums: number[]) {
    if (!nums.length) throw new Error('Lista vacía')
    return nums.reduce((a, b) => a + b, 0) / nums.length
  }
  median(nums: number[]) {
    if (!nums.length) throw new Error('Lista vacía')
    const s = [...nums].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
  }
  mode(nums: number[]) {
    const freq = new Map<number, number>()
    for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1)
    const max = Math.max(...freq.values())
    return [...freq.entries()].filter(([, v]) => v === max).map(([k]) => k)
  }
  variance(nums: number[]) {
    const m = this.mean(nums)
    return this.mean(nums.map(n => (n - m) ** 2))
  }
  stdDev(nums: number[])   { return Math.sqrt(this.variance(nums)) }
  range(nums: number[])    { return Math.max(...nums) - Math.min(...nums) }
  sum(nums: number[])      { return nums.reduce((a, b) => a + b, 0) }
  min(nums: number[])      { return Math.min(...nums) }
  max(nums: number[])      { return Math.max(...nums) }
}
