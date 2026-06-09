import type { Command } from '../../../types/index.js'
import { UnitConverter } from '@lib/calculator.js'

const conv = new UnitConverter()

const HELP = `*CONVERTIDOR DE UNIDADES* 📐

*Longitud:*  !convertir 5 km m
*Peso:*      !convertir 70 kg lb
*Temp:*      !convertir 100 C F
*Velocidad:* !convertir 60 km/h m/s
*Área:*      !convertir 1 ha m2
*Volumen:*   !convertir 2 gal l
*Tiempo:*    !convertir 2 h min
*Energía:*   !convertir 500 kcal j
*Datos:*     !convertir 1 gb mb

*Unidades disponibles:*
> Longitud: mm cm m km in ft yd mi
> Peso: mg g kg t oz lb st
> Temp: C F K
> Velocidad: m/s km/h mph knots ft/s
> Área: mm2 cm2 m2 km2 in2 ft2 ac ha
> Volumen: ml l m3 fl_oz cup pt qt gal
> Tiempo: ms s min h d wk mo yr
> Energía: j kj cal kcal wh kwh btu
> Datos: b kb mb gb tb pb kib mib gib tib`

type ConvFn = (v: number, from: string, to: string) => number

const CATEGORIES: { test: (u: string) => boolean; fn: ConvFn; label: string }[] = [
  { label: 'Longitud',   test: u => ['mm','cm','m','km','in','ft','yd','mi'].includes(u),             fn: (v,f,t) => conv.length(v, f as any, t as any) },
  { label: 'Peso',       test: u => ['mg','g','kg','t','oz','lb','st'].includes(u),                   fn: (v,f,t) => conv.weight(v, f as any, t as any) },
  { label: 'Temperatura',test: u => ['c','f','k'].includes(u.toLowerCase()),                          fn: (v,f,t) => conv.temperature(v, f.toUpperCase() as any, t.toUpperCase() as any) },
  { label: 'Velocidad',  test: u => ['m/s','km/h','mph','knots','ft/s'].includes(u),                  fn: (v,f,t) => conv.speed(v, f as any, t as any) },
  { label: 'Área',       test: u => ['mm2','cm2','m2','km2','in2','ft2','ac','ha'].includes(u),        fn: (v,f,t) => conv.area(v, f as any, t as any) },
  { label: 'Volumen',    test: u => ['ml','l','m3','fl_oz','cup','pt','qt','gal'].includes(u),         fn: (v,f,t) => conv.volume(v, f as any, t as any) },
  { label: 'Tiempo',     test: u => ['ms','s','min','h','d','wk','mo','yr'].includes(u),               fn: (v,f,t) => conv.time(v, f as any, t as any) },
  { label: 'Energía',    test: u => ['j','kj','cal','kcal','wh','kwh','btu'].includes(u),              fn: (v,f,t) => conv.energy(v, f as any, t as any) },
  { label: 'Datos',      test: u => ['b','kb','mb','gb','tb','pb','kib','mib','gib','tib'].includes(u), fn: (v,f,t) => conv.data(v, f as any, t as any) },
]

function fmt(n: number): string {
  if (Math.abs(n) >= 1e9 || (Math.abs(n) < 0.0001 && n !== 0)) return n.toExponential(4)
  return parseFloat(n.toFixed(6)).toLocaleString('es-ES', { maximumFractionDigits: 6 })
}

const command: Command = {
  name: 'convertir',
  aliases: ['convert', 'conv', 'unidad'],
  description: 'Convierte entre unidades de medida (longitud, peso, temperatura, datos…)',
  category: 'util',
  cooldown: 2,

  async execute({ sock, jid, msg, args }) {
    if (args.length < 3) {
      await sock.sendMessage(jid, { text: HELP }, { quoted: msg })
      return
    }

    const [rawVal, from, to] = args as [string, string, string]
    const value = parseFloat(rawVal.replace(',', '.'))

    if (isNaN(value)) {
      await sock.sendMessage(jid, { text: '❌ El valor debe ser un número.' }, { quoted: msg })
      return
    }

    const fromLow = from.toLowerCase()
    const toLow   = to.toLowerCase()

    const cat = CATEGORIES.find(c => c.test(fromLow) && c.test(toLow))
    if (!cat) {
      await sock.sendMessage(jid, {
        text: `❌ Unidades no reconocidas o incompatibles: *${from}* → *${to}*\n\nUsa !convertir para ver la lista.`,
      }, { quoted: msg })
      return
    }

    try {
      const result = cat.fn(value, fromLow, toLow)
      await sock.sendMessage(jid, {
        text: `📐 *CONVERSIÓN* _(${cat.label})_\n\n> ${fmt(value)} ${from} = *${fmt(result)} ${to}*`,
      }, { quoted: msg })
    } catch (err: any) {
      await sock.sendMessage(jid, { text: `❌ ${err?.message ?? 'Error de conversión'}` }, { quoted: msg })
    }
  },
}

export default command
