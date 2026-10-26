import type { Command } from '../../../types/index.js'
import type { NivelCpu } from '@lib/pvp.js'
import { simular, aResultado, type Estilo } from '@lib/arenaSim.js'
import { simularArena } from '@lib/nativeBridge.js'
import { safeSend } from '@lib/media_sender.js'
import { tx, type Idioma } from '@lib/i18n.js'

// #simular: miles de peleas contra la CPU de #arena, con cuatro formas de
// jugar, para saber cuál conviene y cuántas veces se gana (ver arenaSim.ts).
//
// Una simulación a la vez en todo el bot: es trabajo de CPU de varios
// segundos, cediendo el event loop, y dos grupos pidiéndola juntos lo
// duplicarían para nada.

const NIVELES: Record<string, NivelCpu> = {
  facil: 'facil', fácil: 'facil', easy: 'facil', facile: 'facil',
  normal: 'normal', medio: 'normal',
  dificil: 'dificil', difícil: 'dificil', hard: 'dificil', dificile: 'dificil',
}

// En Rust (la Session API), 2.000 peleas por estilo en cualquier nivel: contra
// la CPU difícil, ~2 s en todos los núcleos.
const NATIVO = { peleas: 2000, maxMs: 6000 }

// Si la Session API no está, en JavaScript: contra la CPU difícil cada pelea
// tarda decenas de ms (mira 4 jugadas adelante), entran menos, y se muestra el
// margen.
const PRESUPUESTO: Record<NivelCpu, { peleas: number; maxMs: number }> = {
  facil: { peleas: 2000, maxMs: 3000 },
  normal: { peleas: 2000, maxMs: 3500 },
  dificil: { peleas: 300, maxMs: 6000 },
}

const NOMBRE: Record<Estilo, Record<Idioma, string>> = {
  agresivo:    { es: 'Agresivo', en: 'Aggressive', pt: 'Agressivo' },
  arriesgado:  { es: 'Arriesgado', en: 'Risky', pt: 'Arriscado' },
  defensivo:   { es: 'Defensivo', en: 'Defensive', pt: 'Defensivo' },
  inteligente: { es: 'Inteligente', en: 'Smart', pt: 'Inteligente' },
}
const COMO: Record<Estilo, Record<Idioma, string>> = {
  agresivo:    { es: 'ultimate y después atacar', en: 'ultimate, then attack', pt: 'ultimate e depois atacar' },
  arriesgado:  { es: 'ultimate y después poderoso', en: 'ultimate, then power hit', pt: 'ultimate e depois poderoso' },
  defensivo:   { es: 'curarse, escudo, atacar', en: 'heal, shield, attack', pt: 'curar, escudo, atacar' },
  inteligente: { es: 'pensar dos jugadas, como la CPU', en: 'think two moves ahead, like the CPU', pt: 'pensar duas jogadas, como a CPU' },
}
const NIVEL: Record<NivelCpu, Record<Idioma, string>> = {
  facil: { es: 'fácil', en: 'easy', pt: 'fácil' },
  normal: { es: 'normal', en: 'normal', pt: 'normal' },
  dificil: { es: 'difícil', en: 'hard', pt: 'difícil' },
}

const T = {
  ocupado:  { es: '> ⏳ Ya hay una simulación corriendo. Probá en unos segundos.', en: '> ⏳ A simulation is already running. Try again in a few seconds.', pt: '> ⏳ Já tem uma simulação rodando. Tente em alguns segundos.' },
  titulo:   { es: 'SIMULACIÓN · CPU {n}', en: 'SIMULATION · CPU {n}', pt: 'SIMULAÇÃO · CPU {n}' },
  fila:     { es: '{v}% de victorias ({d}–{h}%) · ~{t} turnos', en: '{v}% wins ({d}–{h}%) · ~{t} turns', pt: '{v}% de vitórias ({d}–{h}%) · ~{t} turnos' },
  peleas:   { es: '{n} peleas por estilo, con las reglas y la CPU de #arena', en: '{n} fights per style, with #arena\'s rules and CPU', pt: '{n} lutas por estilo, com as regras e a CPU do #arena' },
  mejor:    { es: '🏆 Lo que más gana: *{e}*', en: '🏆 What wins most: *{e}*', pt: '🏆 O que mais ganha: *{e}*' },
  empate:   { es: '🏆 *{a}* y *{b}* están parejos: la diferencia entra en el margen', en: '🏆 *{a}* and *{b}* are even: the gap is within the margin', pt: '🏆 *{a}* e *{b}* estão empatados: a diferença cabe na margem' },
  probar:   { es: '> Probalo: `{p}arena cpu {n}` · otro nivel: `{p}simular facil|normal|dificil`', en: '> Try it: `{p}arena cpu {n}` · another level: `{p}simular facil|normal|dificil`', pt: '> Teste: `{p}arena cpu {n}` · outro nível: `{p}simular facil|normal|dificil`' },
  error:    { es: '> No pude simular ahora.', en: '> I couldn\'t simulate right now.', pt: '> Não consegui simular agora.' },
}

const LOCALE: Record<Idioma, string> = { es: 'es-PE', en: 'en-US', pt: 'pt-BR' }

let corriendo = false

const command: Command = {
  name:        'simular',
  aliases:     ['simulate', 'sim', 'probabilidad'],
  description: 'Cuántas veces le ganarías a la CPU de #arena según cómo juegues  |  !simular [facil|normal|dificil]',
  category:    'rpg',
  cooldown:    30,

  async execute({ sock, jid, msg, args, prefix, lang }) {
    const responder = (text: string) => safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
    const nivel = NIVELES[(args[0] ?? '').toLowerCase()] ?? 'normal'
    if (corriendo) return void await responder(tx(lang, T.ocupado))
    corriendo = true
    try {
      const nativo = await simularArena(nivel, NATIVO.peleas, NATIVO.maxMs)
      const r = nativo ? nativo.map(aResultado) : await simular(nivel, PRESUPUESTO[nivel])
      const orden = [...r].sort((a, b) => b.p - a.p)
      const [primero, segundo] = orden
      // 8,8 en español y portugués, 8.8 en inglés.
      const pct = (x: number) => (x * 100).toLocaleString(LOCALE[lang], { maximumFractionDigits: x < 0.1 ? 1 : 0, minimumFractionDigits: x < 0.1 ? 1 : 0 })
      const barra = (p: number) => '▰'.repeat(Math.round(p * 10)) + '▱'.repeat(10 - Math.round(p * 10))
      // Parejos si los intervalos se pisan: decir que uno "gana más" sería
      // leer ruido.
      const parejos = !!segundo && segundo.hasta >= primero!.desde
      await responder([
        `╭─「 🎲 ${tx(lang, T.titulo, { n: tx(lang, NIVEL[nivel]) })} 」`,
        `│`,
        ...orden.flatMap(x => [
          `│ *${tx(lang, NOMBRE[x.estilo])}* — ${tx(lang, COMO[x.estilo])}`,
          `│ ${barra(x.p)} ${tx(lang, T.fila, { v: pct(x.p), d: pct(x.desde), h: pct(x.hasta), t: Math.round(x.turnosMedios) })}`,
        ]),
        `│`,
        parejos
          ? tx(lang, T.empate, { a: tx(lang, NOMBRE[primero!.estilo]), b: tx(lang, NOMBRE[segundo!.estilo]) })
          : tx(lang, T.mejor, { e: tx(lang, NOMBRE[primero!.estilo]) }),
        `> ${tx(lang, T.peleas, { n: Math.min(...r.map(x => x.peleas)).toLocaleString('de-DE') })}`,
        tx(lang, T.probar, { p: prefix, n: nivel }),
        `╰─`,
      ].join('\n'))
    } catch {
      await responder(tx(lang, T.error))
    } finally {
      corriendo = false
    }
  },
}

export default command
