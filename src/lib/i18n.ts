// Idiomas: español, inglés y portugués. El bot nació en español y la mayoría
// de los grupos lo usan así, pero entra gente de Brasil y de Estados Unidos,
// y un "✗ Este comando solo funciona en grupos" no le dice nada a quien no
// habla español.
//
// El idioma de cada persona, en este orden:
//   1. el que eligió con `#idioma`;
//   2. el de su país, por el prefijo del número (+55 → portugués, ver
//      countries.ts) — solo si es uno de los tres;
//   3. el del grupo, si un admin lo fijó (`#idioma grupo en`);
//   4. español.
// El país va antes que el grupo: en un grupo en español, el brasileño igual
// recibe en portugués lo que le contesta a él.
//
// Se traduce de a poco. Lo que todavía no tiene traducción sale en español:
// `t()` cae al español, y una descripción sin traducir también.
//
// Lógica pura: se prueba desde scripts/i18n.test.js.

import { paisDe } from './countries.js'

export type Idioma = 'es' | 'en' | 'pt'

export const IDIOMAS: Record<Idioma, { nombre: string; bandera: string }> = {
  es: { nombre: 'Español',   bandera: '🇪🇸' },
  en: { nombre: 'English',   bandera: '🇺🇸' },
  pt: { nombre: 'Português', bandera: '🇧🇷' },
}

export const esIdioma = (v: unknown): v is Idioma => v === 'es' || v === 'en' || v === 'pt'

/** Lo que alguien escribe en `#idioma <...>`: "en", "english", "inglés", "pt-br"... */
export function leerIdioma(s: string): Idioma | null {
  const v = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (['es', 'espanol', 'spanish', 'castellano', 'espanhol'].includes(v)) return 'es'
  if (['en', 'english', 'ingles', 'eng', 'us', 'uk'].includes(v)) return 'en'
  if (['pt', 'pt-br', 'ptbr', 'br', 'portugues', 'portuguese', 'brasil', 'brazil'].includes(v)) return 'pt'
  return null
}

/** El idioma del país de un número, si es uno de los tres. */
export function idiomaPorNumero(numero: string): Idioma | null {
  if (!numero) return null
  const idioma = paisDe(numero)?.idioma
  return esIdioma(idioma) ? idioma : null
}

export function idiomaDe(o: { elegido?: unknown; numero?: string; grupo?: unknown }): Idioma {
  if (esIdioma(o.elegido)) return o.elegido
  return idiomaPorNumero(o.numero ?? '') ?? (esIdioma(o.grupo) ? o.grupo : 'es')
}

// ─── Textos ───────────────────────────────────────────────────────────────────
// `{nombre}` se reemplaza con vars.nombre.

const TEXTOS = {
  // Despachador (core/handler.ts) y middlewares
  'err.baneado':     { es: '✗ Estás baneado\n§ Motivo: {motivo}', en: '✗ You are banned\n§ Reason: {motivo}', pt: '✗ Você está banido\n§ Motivo: {motivo}' },
  'err.sinMotivo':   { es: 'Sin especificar', en: 'Not specified', pt: 'Não especificado' },
  'err.owner':       { es: '✗ Solo el owner puede usar este comando.', en: '✗ Only the bot owner can use this command.', pt: '✗ Só o dono do bot pode usar este comando.' },
  'err.grupo':       { es: '✗ Este comando solo funciona en grupos.', en: '✗ This command only works in groups.', pt: '✗ Este comando só funciona em grupos.' },
  'err.admin':       { es: '✗ Solo los administradores pueden usar este comando.', en: '✗ Only admins can use this command.', pt: '✗ Só os administradores podem usar este comando.' },
  'err.rpgOff':      { es: '✗ Los comandos RPG están desactivados en este grupo.', en: '✗ RPG commands are turned off in this group.', pt: '✗ Os comandos de RPG estão desativados neste grupo.' },
  'err.premium':     { es: '✗ Este comando es solo para usuarios *premium*.', en: '✗ This command is for *premium* users only.', pt: '✗ Este comando é só para usuários *premium*.' },
  'err.nivel':       { es: '✗ Necesitas nivel *{nivel}*\n§ Tu nivel: {tuyo}', en: '✗ You need level *{nivel}*\n§ Your level: {tuyo}', pt: '✗ Você precisa do nível *{nivel}*\n§ Seu nível: {tuyo}' },
  'err.diamantes':   { es: '✗ No tienes suficientes diamantes.\n§ Costo: {costo} ◆  Tienes: {tienes} ◆', en: '✗ Not enough diamonds.\n§ Cost: {costo} ◆  You have: {tienes} ◆', pt: '✗ Diamantes insuficientes.\n§ Custo: {costo} ◆  Você tem: {tienes} ◆' },
  'err.monedas':     { es: '✗ No tienes suficientes monedas.\n§ Costo: {costo}  Tienes: {tienes}', en: '✗ Not enough coins.\n§ Cost: {costo}  You have: {tienes}', pt: '✗ Moedas insuficientes.\n§ Custo: {costo}  Você tem: {tienes}' },
  'subioNivel':      { es: '🎉 ¡*{nombre}* subió de nivel y ahora es nivel *{nivel}*!', en: '🎉 *{nombre}* leveled up and is now level *{nivel}*!', pt: '🎉 *{nombre}* subiu de nível e agora é nível *{nivel}*!' },
  'subioNiveles':    { es: '🎉 ¡*{nombre}* subió {n} niveles y ahora es nivel *{nivel}*!', en: '🎉 *{nombre}* went up {n} levels and is now level *{nivel}*!', pt: '🎉 *{nombre}* subiu {n} níveis e agora é nível *{nivel}*!' },
  'subiste':         { es: '\n> ◆ *¡Subiste {n} nivel(es)!*', en: '\n> ◆ *You went up {n} level(s)!*', pt: '\n> ◆ *Você subiu {n} nível(is)!*' },
  'cooldown':        { es: '⏳ Espera *{s}s* antes de usar `{cmd}` de nuevo.', en: '⏳ Wait *{s}s* before using `{cmd}` again.', pt: '⏳ Espere *{s}s* antes de usar `{cmd}` de novo.' },
  'spam.espera':     { es: '§ Espera unos segundos antes de enviar otro mensaje.', en: '§ Wait a few seconds before sending another message.', pt: '§ Espere alguns segundos antes de mandar outra mensagem.' },
  'spam.rapido':     { es: '§ Demasiado rápido — espera *{t}*', en: '§ Too fast — wait *{t}*', pt: '§ Rápido demais — espere *{t}*' },
  'spam.rapidoSin':  { es: '§ Demasiado rápido — espera unos segundos', en: '§ Too fast — wait a few seconds', pt: '§ Rápido demais — espere alguns segundos' },
  'spam.bloqueado':  { es: '§ Bloqueado por spam — espera *{t}*', en: '§ Blocked for spam — wait *{t}*', pt: '§ Bloqueado por spam — espere *{t}*' },
  'spam.bloqueadoSin': { es: '§ Bloqueado temporalmente por spam', en: '§ Temporarily blocked for spam', pt: '§ Bloqueado temporariamente por spam' },
  'spam.flood':      { es: '§ Deja de repetir el mismo mensaje', en: '§ Stop repeating the same message', pt: '§ Pare de repetir a mesma mensagem' },
  'spam.otro':       { es: '§ Espera antes de continuar', en: '§ Wait before continuing', pt: '§ Espere antes de continuar' },
  'noExiste':        { es: '𒁈 El comando *{cmd}* no existe.', en: '𒁈 The command *{cmd}* does not exist.', pt: '𒁈 O comando *{cmd}* não existe.' },
  'quisiste':        { es: '¿Quisiste decir {sugerencias}?', en: 'Did you mean {sugerencias}?', pt: 'Você quis dizer {sugerencias}?' },
  'verLista':        { es: 'Para ver la lista de comandos usa:', en: 'To see the list of commands use:', pt: 'Para ver a lista de comandos use:' },

  // Menú y categorías
  'menu.comandos':   { es: 'comandos', en: 'commands', pt: 'comandos' },
  'menu.otras':      { es: 'OTRAS CATEGORÍAS', en: 'OTHER CATEGORIES', pt: 'OUTRAS CATEGORIAS' },
  'menu.todo':       { es: '{p}menu todo — listado completo de comandos', en: '{p}menu all — full list of commands', pt: '{p}menu todo — lista completa de comandos' },
  'menu.categoria':  { es: '{p}categoria <nombre> — ver comandos de una categoría', en: '{p}category <name> — see the commands of a category', pt: '{p}categoria <nome> — ver os comandos de uma categoria' },
  'menu.idioma':     { es: '{p}idioma — cambiar el idioma ({bandera} {nombre})', en: '{p}language — change the language ({bandera} {nombre})', pt: '{p}idioma — mudar o idioma ({bandera} {nombre})' },
  'cat.titulo':      { es: 'CATEGORÍAS DISPONIBLES', en: 'AVAILABLE CATEGORIES', pt: 'CATEGORIAS DISPONÍVEIS' },
  'cat.usar':        { es: 'Usá `{p}categoria <nombre>` para ver los comandos de una categoría', en: 'Use `{p}category <name>` to see the commands of a category', pt: 'Use `{p}categoria <nome>` para ver os comandos de uma categoria' },
  'cat.noExiste':    { es: 'Categoría *{cat}* no encontrada.\nUsa {p}categoria para ver todas.', en: 'Category *{cat}* not found.\nUse {p}category to see them all.', pt: 'Categoria *{cat}* não encontrada.\nUse {p}categoria para ver todas.' },

  // #idioma
  'idioma.actual':   { es: '{bandera} Tu idioma: *{nombre}*{origen}', en: '{bandera} Your language: *{nombre}*{origen}', pt: '{bandera} Seu idioma: *{nombre}*{origen}' },
  'idioma.elegido':  { es: ' (elegido)', en: ' (chosen)', pt: ' (escolhido)' },
  'idioma.auto':     { es: ' (automático: por tu número o el grupo)', en: ' (automatic: from your number or the group)', pt: ' (automático: pelo seu número ou pelo grupo)' },
  'idioma.grupo':    { es: '> Idioma del grupo: {grupo}', en: '> Group language: {grupo}', pt: '> Idioma do grupo: {grupo}' },
  'idioma.ninguno':  { es: 'ninguno', en: 'none', pt: 'nenhum' },
  'idioma.uso':      { es: '> `{p}idioma es|en|pt` · `{p}idioma auto` · `{p}idioma grupo <es|en|pt|off>` (admins)', en: '> `{p}language es|en|pt` · `{p}language auto` · `{p}language group <es|en|pt|off>` (admins)', pt: '> `{p}idioma es|en|pt` · `{p}idioma auto` · `{p}idioma grupo <es|en|pt|off>` (admins)' },
  'idioma.listo':    { es: '{bandera} Listo: te hablo en *{nombre}*.', en: '{bandera} Done: I\'ll talk to you in *{nombre}*.', pt: '{bandera} Pronto: vou falar com você em *{nombre}*.' },
  'idioma.autoListo': { es: '✅ Listo: el idioma vuelve a ser automático (ahora: {bandera} {nombre}).', en: '✅ Done: the language is automatic again (now: {bandera} {nombre}).', pt: '✅ Pronto: o idioma volta a ser automático (agora: {bandera} {nombre}).' },
  'idioma.grupoListo': { es: '{bandera} El idioma del grupo ahora es *{nombre}*: lo usa quien no eligió uno y no tiene un número de un país que hable español, inglés o portugués.', en: '{bandera} The group language is now *{nombre}*: it applies to whoever hasn\'t chosen one and doesn\'t have a number from a Spanish, English or Portuguese speaking country.', pt: '{bandera} O idioma do grupo agora é *{nombre}*: vale para quem não escolheu um e não tem número de um país que fala espanhol, inglês ou português.' },
  'idioma.grupoOff': { es: '✅ El grupo ya no tiene idioma propio.', en: '✅ The group no longer has its own language.', pt: '✅ O grupo não tem mais idioma próprio.' },
  'idioma.noAdmin':  { es: '> Solo los administradores pueden cambiar el idioma del grupo.', en: '> Only admins can change the group language.', pt: '> Só os administradores podem mudar o idioma do grupo.' },
  'idioma.soloGrupo': { es: '> Eso es para grupos.', en: '> That\'s for groups.', pt: '> Isso é para grupos.' },
  'idioma.noEntiendo': { es: '> No conozco ese idioma. Hay: 🇪🇸 es · 🇺🇸 en · 🇧🇷 pt', en: '> I don\'t know that language. There are: 🇪🇸 es · 🇺🇸 en · 🇧🇷 pt', pt: '> Não conheço esse idioma. Há: 🇪🇸 es · 🇺🇸 en · 🇧🇷 pt' },
} satisfies Record<string, Record<Idioma, string>>

export type Clave = keyof typeof TEXTOS

type Vars = Record<string, string | number | undefined>

/** Una fila de textos de un comando: el español siempre, los otros si están. */
export type Fila = { es: string } & Partial<Record<Exclude<Idioma, 'es'>, string>>

/**
 * Como `t`, pero con una fila que trae el propio comando. Los textos de cada
 * comando viven en su archivo, que se carga recién cuando alguien lo usa: este
 * catálogo, que va en el arranque, se queda con lo que comparten todos.
 */
export function tx(idioma: Idioma, fila: Fila, vars: Vars = {}): string {
  const plantilla = fila[idioma] || fila.es
  return plantilla.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m))
}

export function t(idioma: Idioma, clave: Clave, vars: Vars = {}): string {
  return tx(idioma, TEXTOS[clave], vars)
}

// ─── Categorías ───────────────────────────────────────────────────────────────

const CATEGORIAS: Record<string, Partial<Record<Idioma, string>>> = {
  general: { en: 'GENERAL', pt: 'GERAL' },
  media: { en: 'MEDIA', pt: 'MÍDIA' },
  music: { es: 'MÚSICA', en: 'MUSIC', pt: 'MÚSICA' },
  scraper: { es: 'BÚSQUEDAS', en: 'SEARCH', pt: 'BUSCAS' },
  ai: { es: 'IA', en: 'AI', pt: 'IA' },
  admin: { en: 'ADMIN', pt: 'ADMIN' },
  owner: { es: 'DUEÑO', en: 'OWNER', pt: 'DONO' },
  fun: { es: 'DIVERSIÓN', en: 'FUN', pt: 'DIVERSÃO' },
  util: { es: 'UTILIDADES', en: 'UTILITIES', pt: 'UTILIDADES' },
  downloader: { es: 'DESCARGAS', en: 'DOWNLOADS', pt: 'DOWNLOADS' },
  sticker: { es: 'STICKERS', en: 'STICKERS', pt: 'FIGURINHAS' },
  roleplay: { en: 'ROLEPLAY', pt: 'ROLEPLAY' },
  nsfw: { en: 'NSFW', pt: 'NSFW' },
  info: { en: 'INFO', pt: 'INFO' },
  jadibot: { es: 'SUBBOTS', en: 'SUB-BOTS', pt: 'SUB-BOTS' },
  rpg: { en: 'RPG', pt: 'RPG' },
}

/** El nombre de una categoría para mostrar; se sigue escribiendo con su id. */
export function nombreCategoria(cat: string, idioma: Idioma): string {
  return CATEGORIAS[cat]?.[idioma] ?? cat.toUpperCase()
}

// ─── Alias por idioma ─────────────────────────────────────────────────────────
// Se registran para todos (un brasileño en un grupo en español puede escribir
// #ajuda), y el menú muestra primero los del idioma de quien lo pide. Un alias
// que ya use otro comando no se registra: gana el que estaba (ver
// registrarAliasDeIdioma en plugins/commands/index.ts).

export const ALIAS_IDIOMA: Record<Exclude<Idioma, 'es'>, Record<string, string>> = {
  pt: {
    ajuda: 'menu', comandos: 'menu', idioma: 'idioma', lingua: 'idioma',
    perfil: 'perfil', trabalhar: 'work', diario: 'daily', mensal: 'monthly',
    carteira: 'bal', saldo: 'bal', roubar: 'rob', minerar: 'mine', roleta: 'roulette',
    saude: 'salud', presente: 'regalo', loja: 'mercado', cofre: 'chest',
    abracar: 'hug', beijar: 'kiss', chorar: 'cry', rir: 'laugh', tapa: 'slap', socar: 'punch',
    figurinha: 'sticker', fig: 'sticker', traduzir: 'traducir', lembrete: 'recordar', lembrar: 'recordar',
    enquete: 'encuesta', resumo: 'resumen', sorteio: 'sorteo', atividade: 'actividad', marcar: 'tag',
    banir: 'ban', rebaixar: 'demote', aniversario: 'birthday', ausente: 'afk', tempo: 'clima',
  },
  en: {
    language: 'idioma', lang: 'idioma', commands: 'menu', wallet: 'bal', steal: 'rob',
    heal: 'salud', reminder: 'recordar', raffle: 'sorteo', notes: 'nota',
  },
}

/** Los alias de `cmd` para mostrar a alguien de `idioma`: primero los suyos. */
export function aliasesPara(cmd: { name: string; aliases?: string[] }, idioma: Idioma): string[] {
  const propios = idioma === 'es'
    ? []
    : Object.entries(ALIAS_IDIOMA[idioma]).filter(([a, n]) => n === cmd.name && a !== cmd.name).map(([a]) => a)
  return [...new Set([...propios, ...(cmd.aliases ?? [])])]
}
