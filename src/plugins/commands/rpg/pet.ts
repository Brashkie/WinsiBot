import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import type { Command, DragonDef } from '../../../types/index.js'
import type { OwnedDragon } from '@core/events.js'
import {
  getUserData, patchUserData,
  isOnCooldown, setCooldown, getCooldownLeft, fmtCooldown,
} from '@core/events.js'
import {
  elegirCria,
  NIVEL_MIN as CRIA_NIVEL_MIN, COSTO_ORO as CRIA_COSTO_ORO,
  COSTO_DINERO as CRIA_COSTO_DINERO, ESPERA as CRIA_ESPERA,
} from '@lib/breeding.js'
import { aplicarExp } from '@lib/dragonLevel.js'
import {
  companeroDe, esCompanero, ganadoHoy, TOPE_DIA,
  CUIDADOS, cuidar, restante, atendidos, type Cuidado,
} from '@lib/companion.js'
import {
  getDragons, findDragon, pickRandomDragon,
  imageForStage, videoForStage,
  goldPerMinute, pendingGold, translatedDesc, generateEggShakeVideo, transcodeToMp4,
  HATCH_COST_MONEY, FEED_EXP, feedCostOro,
  STAGE3_LEVEL,
} from '@lib/dragoncity.js'
import { downloadBuffer } from '@lib/downloader.js'
import { safeSend } from '@lib/media_sender.js'
import { tx, type Idioma } from '@lib/i18n.js'

// Los textos, en los tres idiomas (ver @lib/i18n.ts). Los subcomandos
// (`hatch`, `feed`, `cuidar`…) no se traducen: son lo que hay que escribir.
const T = {
  adulto:      { es: 'Adulto', en: 'Adult', pt: 'Adulto' },
  joven:       { es: 'Joven', en: 'Young', pt: 'Jovem' },
  titulo:      { es: 'DRAGONES', en: 'DRAGONS', pt: 'DRAGÕES' },
  ninguno:     { es: '│ Todavía no tenés ningún dragón.', en: '│ You don\'t have any dragon yet.', pt: '│ Você ainda não tem nenhum dragão.' },
  primerHuevo: { es: '> {p}pet hatch — conseguí tu primer huevo (¥{c})', en: '> {p}pet hatch — get your first egg (¥{c})', pt: '> {p}pet hatch — pegue seu primeiro ovo (¥{c})' },
  oroPend:     { es: '  (+{n} oro)', en: '  (+{n} gold)', pt: '  (+{n} ouro)' },
  yMas:        { es: '│ … y {n} más', en: '│ … and {n} more', pt: '│ … e mais {n}' },
  oro:         { es: '> Oro » *{n}*', en: '> Gold » *{n}*', pt: '> Ouro » *{n}*' },
  estrella:    { es: '> ⭐ compañero: gana exp con tus mensajes ({a}/{b} hoy) y pelea en #raid', en: '> ⭐ companion: gains exp from your messages ({a}/{b} today) and fights in #raid', pt: '> ⭐ companheiro: ganha exp com suas mensagens ({a}/{b} hoje) e luta no #raid' },
  verCuidar:   { es: '> {p}pet cuidar — comida, agua y paseo ({n}/3 al día)', en: '> {p}pet cuidar — food, water and walk ({n}/3 up to date)', pt: '> {p}pet cuidar — comida, água e passeio ({n}/3 em dia)' },
  verInfo:     { es: '> {p}pet info <#|nombre> — ver detalle', en: '> {p}pet info <#|name> — see details', pt: '> {p}pet info <#|nome> — ver detalhes' },
  verFeed:     { es: '> {p}pet feed <#|nombre> — alimentar', en: '> {p}pet feed <#|name> — feed', pt: '> {p}pet feed <#|nome> — alimentar' },
  verCollect:  { es: '> {p}pet collect — cobrar oro acumulado', en: '> {p}pet collect — collect the stored gold', pt: '> {p}pet collect — coletar o ouro acumulado' },
  verHatch:    { es: '> {p}pet hatch — nuevo huevo (¥{c})', en: '> {p}pet hatch — new egg (¥{c})', pt: '> {p}pet hatch — ovo novo (¥{c})' },
  sinPlataHuevo: { es: '✗ Necesitás *¥{c}* para un huevo. Tenés ¥{t}.', en: '✗ You need *¥{c}* for an egg. You have ¥{t}.', pt: '✗ Você precisa de *¥{c}* para um ovo. Você tem ¥{t}.' },
  sinCatalogo: { es: '✗ No se pudo conectar con el catálogo de dragones. Probá de nuevo en un rato.', en: '✗ Couldn\'t reach the dragon catalog. Try again in a while.', pt: '✗ Não deu para acessar o catálogo de dragões. Tente de novo daqui a pouco.' },
  huevo:       { es: '🥚 Un huevo está a punto de romperse...', en: '🥚 An egg is about to hatch...', pt: '🥚 Um ovo está prestes a chocar...' },
  nacio:       { es: '🐣 *¡Nació {n}!*', en: '🐣 *{n} hatched!*', pt: '🐣 *{n} nasceu!*' },
  oroMin:      { es: '> +{n} oro/min en este nivel', en: '> +{n} gold/min at this level', pt: '> +{n} ouro/min neste nível' },
  feedNuevo:   { es: '> {p}pet feed {i} — para alimentarlo y subirlo de nivel', en: '> {p}pet feed {i} — to feed it and level it up', pt: '> {p}pet feed {i} — para alimentar e subir de nível' },
  criarUso:    { es: '✗ Uso: `{p}pet criar <#> <#>` — dos dragones distintos de tu colección', en: '✗ Usage: `{p}pet criar <#> <#>` — two different dragons from your collection', pt: '✗ Uso: `{p}pet criar <#> <#>` — dois dragões diferentes da sua coleção' },
  criarReglas: { es: '> Los dos en nivel {nv} o más · {o} oro + ¥{d} · una cría cada {h} h', en: '> Both at level {nv} or higher · {o} gold + ¥{d} · one breeding every {h} h', pt: '> Os dois no nível {nv} ou mais · {o} ouro + ¥{d} · uma cria a cada {h} h' },
  criarBajos:  { es: '✗ Para criar, los dos tienen que estar en nivel {nv} o más: {l}.', en: '✗ To breed, both have to be level {nv} or higher: {l}.', pt: '✗ Para cruzar, os dois precisam estar no nível {nv} ou mais: {l}.' },
  nido:        { es: '✗ El nido todavía está ocupado. Vuelve en *{t}*.', en: '✗ The nest is still busy. Come back in *{t}*.', pt: '✗ O ninho ainda está ocupado. Volte em *{t}*.' },
  criarCosto:  { es: '✗ Criar cuesta *{o} oro + ¥{d}*. Tienes {to} oro y ¥{td}.', en: '✗ Breeding costs *{o} gold + ¥{d}*. You have {to} gold and ¥{td}.', pt: '✗ Cruzar custa *{o} ouro + ¥{d}*. Você tem {to} ouro e ¥{td}.' },
  yaNoAlcanza: { es: '✗ Ya no te alcanza para criar.', en: '✗ You can no longer afford breeding.', pt: '✗ Você não tem mais o suficiente para cruzar.' },
  cria:        { es: '💞 *{a}* y *{b}* tuvieron una cría:', en: '💞 *{a}* and *{b}* had a baby:', pt: '💞 *{a}* e *{b}* tiveram um filhote:' },
  feedSubir:   { es: '> {p}pet feed {i} — para subirlo de nivel', en: '> {p}pet feed {i} — to level it up', pt: '> {p}pet feed {i} — para subir de nível' },
  feedUso:     { es: '✗ Uso: `{p}pet feed <#|nombre>`', en: '✗ Usage: `{p}pet feed <#|name>`', pt: '✗ Uso: `{p}pet feed <#|nome>`' },
  noEse:       { es: '✗ No tenés ningún dragón así.', en: '✗ You don\'t have a dragon like that.', pt: '✗ Você não tem nenhum dragão assim.' },
  feedSinOro:  { es: '✗ Necesitás *{c} oro* para alimentar a *{n}*. Tenés {t}.\n> {p}pet collect — para cobrar el oro acumulado', en: '✗ You need *{c} gold* to feed *{n}*. You have {t}.\n> {p}pet collect — to collect the stored gold', pt: '✗ Você precisa de *{c} ouro* para alimentar *{n}*. Você tem {t}.\n> {p}pet collect — para coletar o ouro acumulado' },
  evoluciono:  { es: '✨ *¡{n} evolucionó!*', en: '✨ *{n} evolved!*', pt: '✨ *{n} evoluiu!*' },
  ahoraEs:     { es: '{e} Ahora es {s} · Nv.{l}', en: '{e} Now it is {s} · Lv.{l}', pt: '{e} Agora é {s} · Nv.{l}' },
  oroMinSolo:  { es: '> +{n} oro/min', en: '> +{n} gold/min', pt: '> +{n} ouro/min' },
  alimentaste: { es: '🍖 Alimentaste a *{n}*  (-{c} oro, +{x} EXP)', en: '🍖 You fed *{n}*  (-{c} gold, +{x} EXP)', pt: '🍖 Você alimentou *{n}*  (-{c} ouro, +{x} EXP)' },
  subioNivel:  { es: '\n⬆️ *¡{n} subió al nivel {l}!*', en: '\n⬆️ *{n} reached level {l}!*', pt: '\n⬆️ *{n} subiu para o nível {l}!*' },
  sinDragones: { es: '✗ No tenés dragones todavía.', en: '✗ You don\'t have dragons yet.', pt: '✗ Você ainda não tem dragões.' },
  oroLinea:    { es: '+{n} oro', en: '+{n} gold', pt: '+{n} ouro' },
  sinOroAun:   { es: '✗ Todavía no acumulaste oro — volvé en un rato.', en: '✗ No gold stored yet — come back in a while.', pt: '✗ Ainda não acumulou ouro — volte daqui a pouco.' },
  cobrado:     { es: 'ORO COBRADO', en: 'GOLD COLLECTED', pt: 'OURO COLETADO' },
  total:       { es: '> Total  +{n} oro', en: '> Total  +{n} gold', pt: '> Total  +{n} ouro' },
  balance:     { es: '> Balance {n} oro', en: '> Balance {n} gold', pt: '> Saldo {n} ouro' },
  infoUso:     { es: '✗ Uso: `{p}pet info <#|nombre>` (de tu colección) o `{p}pet info <nombre-dragón>` (del catálogo)', en: '✗ Usage: `{p}pet info <#|name>` (from your collection) or `{p}pet info <dragon-name>` (from the catalog)', pt: '✗ Uso: `{p}pet info <#|nome>` (da sua coleção) ou `{p}pet info <nome-do-dragão>` (do catálogo)' },
  noEncontrado: { es: '✗ No se encontró ningún dragón así.', en: '✗ No dragon like that was found.', pt: '✗ Nenhum dragão assim foi encontrado.' },
  nivelEtapa:  { es: '│ Nv.{l} · {s}', en: '│ Lv.{l} · {s}', pt: '│ Nv.{l} · {s}' },
  habilidades: { es: '│ ⚡ Habilidades:', en: '│ ⚡ Skills:', pt: '│ ⚡ Habilidades:' },
  infoFeed:    { es: '> {p}pet feed {i} — alimentar', en: '> {p}pet feed {i} — feed', pt: '> {p}pet feed {i} — alimentar' },
  infoHatch:   { es: '> {p}pet hatch — conseguí tu propio huevo (¥{c})', en: '> {p}pet hatch — get your own egg (¥{c})', pt: '> {p}pet hatch — pegue seu próprio ovo (¥{c})' },
  sinDragHatch: { es: '✗ No tenés dragones todavía. `{p}pet hatch`', en: '✗ You don\'t have dragons yet. `{p}pet hatch`', pt: '✗ Você ainda não tem dragões. `{p}pet hatch`' },
  feliz:       { es: '😄 Feliz', en: '😄 Happy', pt: '😄 Feliz' },
  bien:        { es: '🙂 Bien', en: '🙂 Fine', pt: '🙂 Bem' },
  descuidado:  { es: '😐 Descuidado', en: '😐 Neglected', pt: '😐 Descuidado' },
  efecto:      { es: '│ {estado}: en #raid pega +{d}% y el jefe le hace {r}% menos', en: '│ {estado}: in #raid it hits +{d}% and the boss does {r}% less to it', pt: '│ {estado}: no #raid bate +{d}% e o chefe faz {r}% menos nele' },
  noNecesita:  { es: '> {e} *{n}* todavía no lo necesita. Volvé en *{t}*.', en: '> {e} *{n}* doesn\'t need it yet. Come back in *{t}*.', pt: '> {e} *{n}* ainda não precisa. Volte em *{t}*.' },
  comio:       { es: 'comió con ganas', en: 'ate happily', pt: 'comeu com vontade' },
  tomo:        { es: 'tomó agua', en: 'drank some water', pt: 'bebeu água' },
  volvio:      { es: 'volvió del paseo (+{x} exp)', en: 'came back from the walk (+{x} exp)', pt: 'voltou do passeio (+{x} exp)' },
  alDia:       { es: '> Cuidados al día: {n}/3{f} — en #raid +{d}% de daño y {r}% menos del contraataque', en: '> Care up to date: {n}/3{f} — in #raid +{d}% damage and {r}% less from the counterattack', pt: '> Cuidados em dia: {n}/3{f} — no #raid +{d}% de dano e {r}% menos do contra-ataque' },
  tuComp:      { es: '⭐ Tu compañero es *{n}* (Nv.{l}).', en: '⭐ Your companion is *{n}* (Lv.{l}).', pt: '⭐ Seu companheiro é *{n}* (Nv.{l}).' },
  elegirOtro:  { es: '> `{p}pet companero <#|nombre>` — elegir otro', en: '> `{p}pet companero <#|name>` — pick another', pt: '> `{p}pet companero <#|nome>` — escolher outro' },
  ganaHasta:   { es: '> Gana hasta {n} exp por día con tus mensajes, y es el que pelea a tu lado en #raid.', en: '> It gains up to {n} exp a day from your messages, and it fights by your side in #raid.', pt: '> Ganha até {n} exp por dia com suas mensagens, e é quem luta ao seu lado no #raid.' },
  esTuComp:    { es: '⭐ *{n}* es tu compañero: gana exp con tus mensajes y pelea a tu lado en #raid.', en: '⭐ *{n}* is your companion: it gains exp from your messages and fights by your side in #raid.', pt: '⭐ *{n}* é seu companheiro: ganha exp com suas mensagens e luta ao seu lado no #raid.' },
  renameUso:   { es: '✗ Uso: `{p}pet rename <#|nombre-actual> <nombre-nuevo>`  (máx 24 caracteres)', en: '✗ Usage: `{p}pet rename <#|current-name> <new-name>`  (max 24 characters)', pt: '✗ Uso: `{p}pet rename <#|nome-atual> <nome-novo>`  (máx 24 caracteres)' },
  renombrado:  { es: '✏️ *{a}* ahora se llama *{b}*.', en: '✏️ *{a}* is now called *{b}*.', pt: '✏️ *{a}* agora se chama *{b}*.' },
  releaseUso:  { es: '✗ Uso: `{p}pet release <#|nombre>`', en: '✗ Usage: `{p}pet release <#|name>`', pt: '✗ Uso: `{p}pet release <#|nome>`' },
  despedida:   { es: '💔 Te despediste de *{n}*. Fue un buen compañero.', en: '💔 You said goodbye to *{n}*. It was a good companion.', pt: '💔 Você se despediu de *{n}*. Foi um bom companheiro.' },
  ayuda:       {
    es: '│ `{p}pet` — ver tu colección\n│ `{p}pet hatch` — nuevo huevo (¥{c})\n│ `{p}pet feed <#|nombre>` — alimentar (con oro)\n│ `{p}pet collect` — cobrar oro acumulado\n│ `{p}pet info <#|nombre>` — detalle de un dragón\n│ `{p}pet criar <#> <#>` — cruzar dos (Nv.{nv}+)\n│ `{p}pet companero <#>` — el que te acompaña (exp por actividad, #raid)\n│ `{p}pet cuidar` — comida, agua y paseo (`comida`, `agua`, `pasear`)\n│ `{p}pet rename <#> <nombre>` — renombrar\n│ `{p}pet release <#|nombre>` — liberar\n│\n> Los dragones nacen ya en su forma joven, evolucionan a su forma final en nivel {s3}, y generan oro pasivo según su nivel.',
    en: '│ `{p}pet` — see your collection\n│ `{p}pet hatch` — new egg (¥{c})\n│ `{p}pet feed <#|name>` — feed (with gold)\n│ `{p}pet collect` — collect the stored gold\n│ `{p}pet info <#|name>` — a dragon\'s details\n│ `{p}pet criar <#> <#>` — breed two (Lv.{nv}+)\n│ `{p}pet companero <#>` — the one that goes with you (exp from activity, #raid)\n│ `{p}pet cuidar` — food, water and walk (`comida`, `agua`, `pasear`)\n│ `{p}pet rename <#> <name>` — rename\n│ `{p}pet release <#|name>` — release\n│\n> Dragons hatch already in their young form, evolve to their final form at level {s3}, and make passive gold based on their level.',
    pt: '│ `{p}pet` — ver sua coleção\n│ `{p}pet hatch` — ovo novo (¥{c})\n│ `{p}pet feed <#|nome>` — alimentar (com ouro)\n│ `{p}pet collect` — coletar o ouro acumulado\n│ `{p}pet info <#|nome>` — detalhes de um dragão\n│ `{p}pet criar <#> <#>` — cruzar dois (Nv.{nv}+)\n│ `{p}pet companero <#>` — o que te acompanha (exp por atividade, #raid)\n│ `{p}pet cuidar` — comida, água e passeio (`comida`, `agua`, `pasear`)\n│ `{p}pet rename <#> <nome>` — renomear\n│ `{p}pet release <#|nome>` — libertar\n│\n> Os dragões já nascem na forma jovem, evoluem para a forma final no nível {s3} e geram ouro passivo de acordo com o nível.',
  },
}

const NOMBRE_CUIDADO: Record<Cuidado, { es: string; en: string; pt: string }> = {
  comida: { es: 'Comida', en: 'Food', pt: 'Comida' },
  agua:   { es: 'Agua', en: 'Water', pt: 'Água' },
  paseo:  { es: 'Paseo', en: 'Walk', pt: 'Passeio' },
}

const STAGE_EMOJI: Record<1 | 3, string> = { 1: '🐲', 3: '🐉' }

function stageLabel(stage: 1 | 3, lang: Idioma): string {
  return tx(lang, stage === 3 ? T.adulto : T.joven)
}

// ─── Resolver un dragón de la colección del usuario por índice o nombre ──────
function resolveOwned(dragons: OwnedDragon[], query: string): { dragon: OwnedDragon; index: number } | null {
  const asIndex = Number(query)
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= dragons.length) {
    return { dragon: dragons[asIndex - 1]!, index: asIndex - 1 }
  }
  const needle = query.toLowerCase().trim()
  const index  = dragons.findIndex(d => d.name.toLowerCase() === needle)
  if (index === -1) return null
  return { dragon: dragons[index]!, index }
}

/** El dragón recién nacido: su video de etapa 1, o la imagen, o el texto solo. */
async function revelar(sock: WASocket, jid: string, msg: WAMessage, def: DragonDef, caption: string): Promise<void> {
  try {
    const vidUrl = videoForStage(def, 1)
    const webm   = vidUrl ? await downloadBuffer(vidUrl) : null
    const buffer = webm ? await transcodeToMp4(webm) : null
    if (buffer) {
      await safeSend(() => sock.sendMessage(jid, { video: buffer, caption, gifPlayback: true }, { quoted: msg }))
      return
    }
  } catch { /* cae a imagen abajo */ }

  try {
    const imgUrl = imageForStage(def, 1)
    const buffer = imgUrl ? await downloadBuffer(imgUrl) : null
    if (buffer) {
      await safeSend(() => sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg }))
      return
    }
  } catch { /* cae a texto abajo */ }

  await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
}

const applyExp = aplicarExp

const CUIDADO_DE: Record<string, Cuidado> = {
  comida: 'comida', snack: 'comida', bocadillo: 'comida',
  agua: 'agua', beber: 'agua', water: 'agua',
  pasear: 'paseo', paseo: 'paseo', walk: 'paseo',
}

/** "🍖 Comida ✅ 5 h 20 min" por cada cuidado. */
function lineasCuidado(user: Parameters<typeof atendidos>[0], lang: Idioma): string[] {
  return (Object.keys(CUIDADOS) as Cuidado[]).map(c => {
    const queda = restante(user, c)
    return `│ ${CUIDADOS[c].emoji} ${tx(lang, NOMBRE_CUIDADO[c])} ${queda > 0 ? `✅ ${fmtCooldown(queda)}` : '❌'}`
  })
}

const command: Command = {
  name:        'pet',
  aliases:     ['mascota', 'mipet', 'dragon', 'dragones'],
  description: 'Sistema de dragones (Dragon City)  |  !pet <subcomando>',
  category:    'rpg',
  cooldown:    3,

  async execute({ sock, jid, msg, args, sender, pushName, prefix, lang }) {
    const p = prefix
    const sub  = (args[0] ?? '').toLowerCase()
    const user = getUserData(sender, pushName)

    // ── view / lista de la colección ──────────────────────────────────────────
    if (!sub || sub === 'view' || sub === 'ver' || sub === 'list' || sub === 'lista' || sub === 'coleccion') {
      if (!user.dragons.length) {
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            `╭─「 🐉 ${tx(lang, T.titulo)} 」`,
            `│`,
            tx(lang, T.ninguno),
            `│`,
            tx(lang, T.primerHuevo, { p, c: HATCH_COST_MONEY.toLocaleString() }),
            `╰─`,
          ].join('\n'),
        }, { quoted: msg }))
        return
      }

      const rows = user.dragons.slice(0, 25).map((d, i) => {
        const pending = pendingGold(d.level, d.lastCollect)
        return `│ ${STAGE_EMOJI[d.stage]} \`${i + 1}\` *${d.name}* — Nv.${d.level} · ${stageLabel(d.stage, lang)}` +
               (esCompanero(user, d) ? '  ⭐' : '') +
               (pending > 0 ? tx(lang, T.oroPend, { n: pending.toLocaleString() }) : '')
      })
      const extra = user.dragons.length > 25 ? [`│`, tx(lang, T.yMas, { n: user.dragons.length - 25 })] : []

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 🐉 ${tx(lang, T.titulo)} — ${user.dragons.length} 」`,
          `│`,
          ...rows,
          ...extra,
          `│`,
          tx(lang, T.oro, { n: user.oro.toLocaleString() }),
          tx(lang, T.estrella, { a: ganadoHoy(user), b: TOPE_DIA }),
          tx(lang, T.verCuidar, { p, n: atendidos(user) }),
          tx(lang, T.verInfo, { p }),
          tx(lang, T.verFeed, { p }),
          tx(lang, T.verCollect, { p }),
          tx(lang, T.verHatch, { p, c: HATCH_COST_MONEY.toLocaleString() }),
          `╰─`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── hatch — conseguir un nuevo dragón ─────────────────────────────────────
    if (sub === 'hatch' || sub === 'incubar' || sub === 'huevo') {
      if (user.money < HATCH_COST_MONEY) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.sinPlataHuevo, { c: HATCH_COST_MONEY.toLocaleString(), t: user.money.toLocaleString() }),
        }, { quoted: msg }))
        return
      }

      let dragons: DragonDef[]
      try {
        dragons = await getDragons()
      } catch {
        dragons = []
      }
      if (!dragons.length) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.sinCatalogo),
        }, { quoted: msg }))
        return
      }

      const picked = pickRandomDragon(dragons)

      // ── mensaje 1: el huevo "temblando" — video generado al vuelo con
      // ffmpeg a partir de la imagen estática (la fuente no trae ningún
      // asset animado para este momento, solo para las evoluciones) ────────
      try {
        const eggImgUrl = imageForStage(picked, 0)
        const eggBuffer = eggImgUrl ? await downloadBuffer(eggImgUrl) : null
        const shakeVideo = eggBuffer ? await generateEggShakeVideo(eggBuffer) : null
        if (shakeVideo) {
          await safeSend(() => sock.sendMessage(jid, {
            video:   shakeVideo,
            caption: tx(lang, T.huevo),
            gifPlayback: true,
          }, { quoted: msg }))
        } else {
          await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.huevo) }, { quoted: msg }))
        }
      } catch {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.huevo) }, { quoted: msg }))
      }

      // ── registrar el dragón — arranca directo en etapa 1 (recién nacido) ─
      const owned: OwnedDragon = {
        id:          picked.id,
        slug:        picked.slug,
        name:        picked.name,
        level:       1,
        exp:         0,
        stage:       1,
        hatchedAt:   Date.now(),
        lastCollect: Date.now(),
      }
      patchUserData(sender, { money: user.money - HATCH_COST_MONEY, dragons: [...user.dragons, owned] })

      // ── mensaje 2: revelación — video real de la etapa 1, con la info ────
      const newIndex = user.dragons.length + 1
      await revelar(sock, jid, msg, picked, [
        tx(lang, T.nacio, { n: picked.name }),
        `${picked.rarity} · ${picked.elements.join('/')}`,
        ``,
        tx(lang, T.oroMin, { n: goldPerMinute(1) }),
        tx(lang, T.feedNuevo, { p, i: newIndex }),
      ].join('\n'))
      return
    }

    // ── criar — cruzar dos dragones propios ──────────────────────────────────
    if (sub === 'criar' || sub === 'breed' || sub === 'cruzar') {
      const [qa, qb] = [args[1], args[2]]
      const a = qa ? resolveOwned(user.dragons, qa) : null
      const b = qb ? resolveOwned(user.dragons, qb) : null
      if (!a || !b || a.index === b.index) {
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            tx(lang, T.criarUso, { p }),
            tx(lang, T.criarReglas, { nv: CRIA_NIVEL_MIN, o: CRIA_COSTO_ORO.toLocaleString(), d: CRIA_COSTO_DINERO.toLocaleString(), h: CRIA_ESPERA / 3_600_000 }),
          ].join('\n'),
        }, { quoted: msg }))
        return
      }
      const bajos = [a, b].filter(x => x.dragon.level < CRIA_NIVEL_MIN).map(x => `*${x.dragon.name}* (Nv.${x.dragon.level})`)
      if (bajos.length) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.criarBajos, { nv: CRIA_NIVEL_MIN, l: bajos.join(', ') }),
        }, { quoted: msg }))
        return
      }
      if (isOnCooldown(sender, 'lastBreed', CRIA_ESPERA)) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.nido, { t: fmtCooldown(getCooldownLeft(sender, 'lastBreed', CRIA_ESPERA)) }),
        }, { quoted: msg }))
        return
      }
      if (user.oro < CRIA_COSTO_ORO || user.money < CRIA_COSTO_DINERO) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.criarCosto, { o: CRIA_COSTO_ORO.toLocaleString(), d: CRIA_COSTO_DINERO.toLocaleString(), to: user.oro.toLocaleString(), td: user.money.toLocaleString() }),
        }, { quoted: msg }))
        return
      }

      let catalogo: DragonDef[] = []
      let defA: DragonDef | undefined
      let defB: DragonDef | undefined
      try {
        catalogo = await getDragons()
        defA = catalogo.find(d => d.id === a.dragon.id)
        defB = catalogo.find(d => d.id === b.dragon.id)
      } catch { /* abajo */ }
      if (!defA || !defB) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.sinCatalogo),
        }, { quoted: msg }))
        return
      }

      // El catálogo es un viaje de red: en ese rato pudo gastar oro o dinero
      // con otro comando. `user` es el objeto vivo, así que se vuelve a mirar.
      if (user.oro < CRIA_COSTO_ORO || user.money < CRIA_COSTO_DINERO || isOnCooldown(sender, 'lastBreed', CRIA_ESPERA)) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.yaNoAlcanza) }, { quoted: msg }))
        return
      }

      const cria = elegirCria(defA, defB, catalogo)
      const owned: OwnedDragon = {
        id: cria.id, slug: cria.slug, name: cria.name,
        level: 1, exp: 0, stage: 1, hatchedAt: Date.now(), lastCollect: Date.now(),
      }
      setCooldown(sender, 'lastBreed')
      patchUserData(sender, {
        oro:     user.oro - CRIA_COSTO_ORO,
        money:   user.money - CRIA_COSTO_DINERO,
        dragons: [...user.dragons, owned],
      })

      await revelar(sock, jid, msg, cria, [
        tx(lang, T.cria, { a: a.dragon.name, b: b.dragon.name }),
        tx(lang, T.nacio, { n: cria.name }),
        `${cria.rarity} · ${cria.elements.join('/')}`,
        ``,
        tx(lang, T.feedSubir, { p, i: user.dragons.length + 1 }),
      ].join('\n'))
      return
    }

    // ── feed — alimentar con Oro para ganar experiencia ───────────────────────
    if (sub === 'feed' || sub === 'alimentar' || sub === 'comer') {
      const query = args.slice(1).join(' ').trim()
      if (!query) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.feedUso, { p }),
        }, { quoted: msg }))
        return
      }
      const found = resolveOwned(user.dragons, query)
      if (!found) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.noEse) }, { quoted: msg }))
        return
      }

      const { dragon, index } = found
      const cost = feedCostOro(dragon.level)
      if (user.oro < cost) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.feedSinOro, { c: cost.toLocaleString(), n: dragon.name, t: user.oro.toLocaleString(), p }),
        }, { quoted: msg }))
        return
      }

      const { leveled, evolvedToFinal } = applyExp(dragon, FEED_EXP)
      const dragons = [...user.dragons]
      dragons[index] = dragon
      patchUserData(sender, { oro: user.oro - cost, dragons })

      // ── evolución final — se muestra el video una sola vez, al momento exacto ─
      if (evolvedToFinal) {
        let def
        try { def = await findDragon(dragon.id) } catch { def = undefined }
        const vidUrl = def ? videoForStage(def, 3) : undefined
        const caption = [
          tx(lang, T.evoluciono, { n: dragon.name }),
          tx(lang, T.ahoraEs, { e: STAGE_EMOJI[3], s: stageLabel(3, lang), l: dragon.level }),
          tx(lang, T.oroMinSolo, { n: goldPerMinute(dragon.level) }),
        ].join('\n')

        try {
          const webm   = vidUrl ? await downloadBuffer(vidUrl) : null
          const buffer = webm ? await transcodeToMp4(webm) : null
          if (buffer) {
            await safeSend(() => sock.sendMessage(jid, { video: buffer, caption, gifPlayback: true }, { quoted: msg }))
          } else {
            await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
          }
        } catch {
          await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
        }
        return
      }

      let text = tx(lang, T.alimentaste, { n: dragon.name, c: cost.toLocaleString(), x: FEED_EXP })
      if (leveled) text += tx(lang, T.subioNivel, { n: dragon.name, l: dragon.level })
      await safeSend(() => sock.sendMessage(jid, { text }, { quoted: msg }))
      return
    }

    // ── collect — cobrar oro acumulado de todos los dragones ─────────────────
    if (sub === 'collect' || sub === 'recolectar' || sub === 'cobrar') {
      if (!user.dragons.length) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.sinDragones) }, { quoted: msg }))
        return
      }

      const now = Date.now()
      let total = 0
      const rows: string[] = []

      const updated = user.dragons.map(d => {
        const income = pendingGold(d.level, d.lastCollect)
        if (income > 0) {
          total += income
          rows.push(`│ ${STAGE_EMOJI[d.stage]} \`${d.name}\`  ${tx(lang, T.oroLinea, { n: income.toLocaleString() })}`)
        }
        return { ...d, lastCollect: now }
      })

      if (total <= 0) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.sinOroAun) }, { quoted: msg }))
        return
      }

      patchUserData(sender, { oro: user.oro + total, dragons: updated })

      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 🪙 ${tx(lang, T.cobrado)} 」`,
          `│`,
          ...rows,
          `│`,
          tx(lang, T.total, { n: total.toLocaleString() }),
          tx(lang, T.balance, { n: (user.oro + total).toLocaleString() }),
          `╰─`,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── info — detalle de un dragón (propio o del catálogo) ──────────────────
    if (sub === 'info') {
      const query = args.slice(1).join(' ').trim()
      if (!query) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.infoUso, { p }),
        }, { quoted: msg }))
        return
      }

      const owned = resolveOwned(user.dragons, query)
      let def
      try {
        def = await findDragon(owned ? owned.dragon.slug : query)
      } catch { def = undefined }

      if (!def) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.noEncontrado) }, { quoted: msg }))
        return
      }

      const desc  = await translatedDesc(def, lang)
      const stage = owned ? owned.dragon.stage : 3
      const skills = def.habilidad.slice(0, 4)
        .map(s => `│ ${s.trainable ? '★' : '☆'} ${s.name} (${s.element}, ${s.power})`)

      const caption = [
        `╭─「 🐉 ${def.name} 」`,
        `│`,
        `│ ${def.rarity} · ${def.elements.join('/')}`,
        ...(owned ? [
          tx(lang, T.nivelEtapa, { l: owned.dragon.level, s: stageLabel(owned.dragon.stage, lang) }),
          `│ ${tx(lang, T.oroLinea, { n: goldPerMinute(owned.dragon.level) })}/min`,
        ] : []),
        `│`,
        `> ${desc}`,
        ...(skills.length ? [`│`, tx(lang, T.habilidades), ...skills] : []),
        `│`,
        ...(owned
          ? [tx(lang, T.infoFeed, { p, i: owned.index + 1 }), tx(lang, T.verCollect, { p })]
          : [tx(lang, T.infoHatch, { p, c: HATCH_COST_MONEY.toLocaleString() })]),
        `╰─`,
      ].join('\n')

      // El video real (stage 1/3) se muestra en loop como GIF — mucho más
      // vivo que la imagen estática, y ya lo tenemos descargado igual para
      // el momento de nacer/evolucionar.
      let sentMedia = false
      try {
        const vidUrl = videoForStage(def, stage)
        const webm   = vidUrl ? await downloadBuffer(vidUrl) : null
        const buffer = webm ? await transcodeToMp4(webm) : null
        if (buffer) {
          await safeSend(() => sock.sendMessage(jid, { video: buffer, caption, gifPlayback: true }, { quoted: msg }))
          sentMedia = true
        }
      } catch { /* cae a imagen abajo */ }

      if (!sentMedia) {
        try {
          const imgUrl = imageForStage(def, stage)
          const buffer = imgUrl ? await downloadBuffer(imgUrl) : null
          if (buffer) {
            await safeSend(() => sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg }))
            sentMedia = true
          }
        } catch { /* cae a texto abajo */ }
      }

      if (!sentMedia) {
        await safeSend(() => sock.sendMessage(jid, { text: caption }, { quoted: msg }))
      }
      return
    }

    // ── cuidar — comida, agua y paseo del compañero (ver companion.ts) ────────
    if (sub === 'cuidar' || sub === 'cuidados' || sub === 'care') {
      const comp = companeroDe(user)
      if (!comp) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.sinDragHatch, { p }) }, { quoted: msg }))
        return
      }
      const n = atendidos(user)
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `╭─「 🐉 ${comp.name} 」`,
          `│`,
          ...lineasCuidado(user, lang),
          `│`,
          tx(lang, T.efecto, { estado: tx(lang, n === 3 ? T.feliz : n ? T.bien : T.descuidado), d: n * 5, r: n * 15 }),
          `╰─ \`${prefix}pet comida\` · \`${prefix}pet agua\` · \`${prefix}pet pasear\``,
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    if (CUIDADO_DE[sub]) {
      const c = CUIDADO_DE[sub]!
      const r = cuidar(user, c)
      if (!r.ok) {
        await safeSend(() => sock.sendMessage(jid, {
          text: r.motivo === 'sin-companero'
            ? tx(lang, T.sinDragHatch, { p })
            : tx(lang, T.noNecesita, { e: CUIDADOS[c].emoji, n: companeroDe(user)!.name, t: fmtCooldown(r.falta) }),
        }, { quoted: msg }))
        return
      }
      const n = atendidos(user)
      const frase = c === 'comida' ? tx(lang, T.comio) : c === 'agua' ? tx(lang, T.tomo) : tx(lang, T.volvio, { x: r.exp })
      await safeSend(() => sock.sendMessage(jid, {
        text: [
          `${CUIDADOS[c].emoji} *${r.dragon.name}* ${frase}.`,
          tx(lang, T.alDia, { n, f: n === 3 ? ' 😄' : '', d: n * 5, r: n * 15 }),
        ].join('\n'),
      }, { quoted: msg }))
      return
    }

    // ── companero — el que gana exp con la actividad y pelea en #raid ─────────
    if (sub === 'companero' || sub === 'compañero' || sub === 'acompanante' || sub === 'equipar') {
      const query = args.slice(1).join(' ').trim()
      const found = query ? resolveOwned(user.dragons, query) : null
      if (!found) {
        const actual = companeroDe(user)
        await safeSend(() => sock.sendMessage(jid, {
          text: [
            actual ? tx(lang, T.tuComp, { n: actual.name, l: actual.level }) : tx(lang, T.sinDragones),
            tx(lang, T.elegirOtro, { p }),
            tx(lang, T.ganaHasta, { n: TOPE_DIA }),
          ].join('\n'),
        }, { quoted: msg }))
        return
      }
      patchUserData(sender, { companero: found.dragon.hatchedAt })
      await safeSend(() => sock.sendMessage(jid, {
        text: tx(lang, T.esTuComp, { n: found.dragon.name }),
      }, { quoted: msg }))
      return
    }

    // ── rename — renombrar un dragón propio ───────────────────────────────────
    if (sub === 'rename' || sub === 'renombrar') {
      const query   = args[1]
      const newName = args.slice(2).join(' ').trim()
      if (!query || !newName || newName.length > 24) {
        await safeSend(() => sock.sendMessage(jid, {
          text: tx(lang, T.renameUso, { p }),
        }, { quoted: msg }))
        return
      }
      const found = resolveOwned(user.dragons, query)
      if (!found) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.noEse) }, { quoted: msg }))
        return
      }
      const oldName = found.dragon.name
      const dragons = [...user.dragons]
      dragons[found.index] = { ...found.dragon, name: newName }
      patchUserData(sender, { dragons })
      await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.renombrado, { a: oldName, b: newName }) }, { quoted: msg }))
      return
    }

    // ── release / liberar ─────────────────────────────────────────────────────
    if (sub === 'release' || sub === 'liberar' || sub === 'soltar') {
      const query = args.slice(1).join(' ').trim()
      const found = resolveOwned(user.dragons, query)
      if (!found) {
        await safeSend(() => sock.sendMessage(jid, { text: tx(lang, T.releaseUso, { p }) }, { quoted: msg }))
        return
      }
      const dragons = user.dragons.filter((_, i) => i !== found.index)
      patchUserData(sender, { dragons })
      await safeSend(() => sock.sendMessage(jid, {
        text: tx(lang, T.despedida, { n: found.dragon.name }),
      }, { quoted: msg }))
      return
    }

    // ── ayuda ──────────────────────────────────────────────────────────────────
    await safeSend(() => sock.sendMessage(jid, {
      text: [
        `╭─「 🐉 DRAGON CITY 」`,
        `│`,
        tx(lang, T.ayuda, { p, c: HATCH_COST_MONEY.toLocaleString(), nv: CRIA_NIVEL_MIN, s3: STAGE3_LEVEL }),
        `╰─`,
      ].join('\n'),
    }, { quoted: msg }))
  },
}

export default command
