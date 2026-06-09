import type { Command } from '../../../types/index.js'
import { ExpressionEvaluator, ScientificCalculator, StatisticsCalculator } from '@lib/calculator.js'

const calc   = new ScientificCalculator()
const stats  = new StatisticsCalculator()
const evalua = new ExpressionEvaluator()

function fmt(n: number): string {
  return parseFloat(n.toFixed(10)).toLocaleString('es-ES')
}

const command: Command = {
  name: 'calc',
  aliases: ['calcular', 'matematica', 'mat'],
  description: 'Calculadora científica con expresiones y estadísticas',
  category: 'util',
  cooldown: 2,

  async execute({ sock, jid, msg, args }) {
    if (!args.length) {
      await sock.sendMessage(jid, {
        text: `*CALCULADORA* 🔢

> *Expresión:* !calc 2 + 2 * 10
> *Funciones:* !calc sin 45 | cos 60 | tan 30
> *Potencia:* !calc 2 ^ 8
> *Raíz:* !calc sqrt 144
> *Factorial:* !calc factorial 7
> *Logaritmo:* !calc log 1000 | ln 2.7
> *Estadística:* !calc stats 4,8,15,16,23,42
> *Fibonacci:* !calc fib 10

_Operadores: + - * / ^ ( ) %_`,
      }, { quoted: msg })
      return
    }

    const input = args.join(' ').trim()
    const lower = input.toLowerCase()

    try {
      let result = ''

      // ── Trigonometry ──────────────────────────────────────────────────────
      if (lower.startsWith('sin '))         result = `sin(${args[1]}°) = ${fmt(calc.sin(+args[1]!))}`
      else if (lower.startsWith('cos '))    result = `cos(${args[1]}°) = ${fmt(calc.cos(+args[1]!))}`
      else if (lower.startsWith('tan '))    result = `tan(${args[1]}°) = ${fmt(calc.tan(+args[1]!))}`
      else if (lower.startsWith('asin '))   result = `asin(${args[1]}) = ${fmt(calc.asin(+args[1]!))}°`
      else if (lower.startsWith('acos '))   result = `acos(${args[1]}) = ${fmt(calc.acos(+args[1]!))}°`
      else if (lower.startsWith('atan '))   result = `atan(${args[1]}) = ${fmt(calc.atan(+args[1]!))}°`

      // ── Root / log / exp ──────────────────────────────────────────────────
      else if (lower.startsWith('sqrt '))   result = `√${args[1]} = ${fmt(calc.sqrt(+args[1]!))}`
      else if (lower.startsWith('cbrt '))   result = `∛${args[1]} = ${fmt(calc.cbrt(+args[1]!))}`
      else if (lower.startsWith('log '))    result = `log(${args[1]}) = ${fmt(calc.log(+args[1]!))}`
      else if (lower.startsWith('ln '))     result = `ln(${args[1]}) = ${fmt(calc.ln(+args[1]!))}`
      else if (lower.startsWith('exp '))    result = `e^${args[1]} = ${fmt(calc.exp(+args[1]!))}`

      // ── Factorial / prime / gcd ───────────────────────────────────────────
      else if (lower.startsWith('factorial ')) result = `${args[1]}! = ${fmt(calc.factorial(+args[1]!))}`
      else if (lower.startsWith('primo '))     result = `${args[1]} es ${calc.isPrime(+args[1]!) ? 'PRIMO ✅' : 'compuesto ❌'}`
      else if (lower.startsWith('mcd '))       result = `MCD(${args[1]}, ${args[2]}) = ${calc.gcd(+args[1]!, +args[2]!)}`
      else if (lower.startsWith('mcm '))       result = `MCM(${args[1]}, ${args[2]}) = ${calc.lcm(+args[1]!, +args[2]!)}`
      else if (lower.startsWith('fib '))       result = `Fibonacci(${args[1]}) = ${calc.fibonacci(+args[1]!)}`
      else if (lower.startsWith('abs '))       result = `|${args[1]}| = ${fmt(calc.abs(+args[1]!))}`

      // ── Statistics ────────────────────────────────────────────────────────
      else if (lower.startsWith('stats ')) {
        const nums = args.slice(1).join('').split(',').map(Number).filter(n => !isNaN(n))
        if (!nums.length) throw new Error('Formato: !calc stats 1,2,3,4,5')
        result = [
          `*Estadísticas de [${nums.join(', ')}]*`,
          `> Media:     ${fmt(stats.mean(nums))}`,
          `> Mediana:   ${fmt(stats.median(nums))}`,
          `> Moda:      ${stats.mode(nums).map(fmt).join(', ')}`,
          `> Desv. Std: ${fmt(stats.stdDev(nums))}`,
          `> Varianza:  ${fmt(stats.variance(nums))}`,
          `> Rango:     ${fmt(stats.range(nums))}`,
          `> Suma:      ${fmt(stats.sum(nums))}`,
          `> Min/Max:   ${fmt(stats.min(nums))} / ${fmt(stats.max(nums))}`,
        ].join('\n')
      }

      // ── Expression ────────────────────────────────────────────────────────
      else {
        const res = evalua.evaluate(input)
        result = `${input} = *${fmt(res)}*`
      }

      await sock.sendMessage(jid, {
        text: `🔢 *CALCULADORA*\n\n${result}`,
      }, { quoted: msg })

    } catch (err: any) {
      await sock.sendMessage(jid, {
        text: `❌ Error: ${err?.message ?? 'Expresión inválida'}`,
      }, { quoted: msg })
    }
  },
}

export default command
