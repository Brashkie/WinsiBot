import type { Command, BotContext } from '../../../types/index.js'
import type { SavedSticker, UserData } from '@core/events.js'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { getUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { saveStickerFile, readStickerFile, deleteStickerFile, MAX_GUARDADOS } from '@lib/stickerVault.js'
import { tx } from '@lib/i18n.js'

// Paquetes de stickers: tus stickers guardados, agrupados con un nombre
// (#newpack, #stickeradd, #getpack…). Van sobre la misma colección que
// #savesticker —el .webp en data/stickers/, y en el usuario solo el nombre y
// a qué paquete pertenece—, así que el tope de 200 es uno solo para todo.
//
// #getpack los manda de a uno: WhatsApp no tiene un mensaje de "paquete" que
// Baileys sepa armar. Hasta 30 por paquete, los que entran en uno de WhatsApp.

const MAX_PAQUETES = 20
const MAX_POR_PAQUETE = 30
const MAX_NOMBRE = 24

const T = {
  usoNuevo:   { es: '✗ Uso: `{p}newpack <nombre>`', en: '✗ Usage: `{p}newpack <name>`', pt: '✗ Uso: `{p}newpack <nome>`' },
  largo:      { es: '✗ El nombre puede tener hasta {n} caracteres.', en: '✗ The name can be up to {n} characters.', pt: '✗ O nome pode ter até {n} caracteres.' },
  yaExiste:   { es: '✗ Ya tenés un paquete *{n}*.', en: '✗ You already have a pack *{n}*.', pt: '✗ Você já tem um pacote *{n}*.' },
  maxPaq:     { es: '✗ Llegaste a {n} paquetes. Borrá uno con `{p}delpack <nombre>`.', en: '✗ You reached {n} packs. Delete one with `{p}delpack <name>`.', pt: '✗ Você chegou a {n} pacotes. Apague um com `{p}delpack <nome>`.' },
  creado:     { es: '📦 Paquete *{n}* creado.\n> Citá un sticker con `{p}stickeradd {n}` para agregarlo', en: '📦 Pack *{n}* created.\n> Quote a sticker with `{p}stickeradd {n}` to add it', pt: '📦 Pacote *{n}* criado.\n> Cite uma figurinha com `{p}stickeradd {n}` para adicionar' },
  usoAdd:     { es: '✗ Citá un sticker con `{p}stickeradd <paquete>`.', en: '✗ Quote a sticker with `{p}stickeradd <pack>`.', pt: '✗ Cite uma figurinha com `{p}stickeradd <pacote>`.' },
  lleno:      { es: '✗ *{n}* ya tiene {max} stickers, lo que entra en un paquete de WhatsApp.', en: '✗ *{n}* already has {max} stickers, as many as a WhatsApp pack holds.', pt: '✗ *{n}* já tem {max} figurinhas, o que cabe num pacote do WhatsApp.' },
  maxTotal:   { es: '✗ Llegaste a {n} stickers guardados entre todos tus paquetes.', en: '✗ You reached {n} saved stickers across all your packs.', pt: '✗ Você chegou a {n} figurinhas guardadas somando seus pacotes.' },
  agregado:   { es: '✅ Agregado a *{n}* ({c}/{max}).', en: '✅ Added to *{n}* ({c}/{max}).', pt: '✅ Adicionada a *{n}* ({c}/{max}).' },
  noPaquete:  { es: '✗ No tenés ningún paquete *{n}*. `{p}stickerpacks` para ver los tuyos.', en: '✗ You don\'t have a pack *{n}*. `{p}stickerpacks` to see yours.', pt: '✗ Você não tem nenhum pacote *{n}*. `{p}stickerpacks` para ver os seus.' },
  usoDel:     { es: '✗ Uso: `{p}stickerdel <paquete> <número>` (el número sale en `{p}getpack <paquete>`)', en: '✗ Usage: `{p}stickerdel <pack> <number>` (the number shows up in `{p}getpack <pack>`)', pt: '✗ Uso: `{p}stickerdel <pacote> <número>` (o número aparece em `{p}getpack <pacote>`)' },
  noNumero:   { es: '✗ *{n}* no tiene un sticker {i}: tiene {c}.', en: '✗ *{n}* has no sticker {i}: it has {c}.', pt: '✗ *{n}* não tem figurinha {i}: tem {c}.' },
  quitado:    { es: '🗑️ Quitaste el {i} de *{n}*.', en: '🗑️ You removed number {i} from *{n}*.', pt: '🗑️ Você tirou a {i} de *{n}*.' },
  ninguno:    { es: '📦 Todavía no tenés paquetes.\n> `{p}newpack <nombre>` para crear uno', en: '📦 You don\'t have packs yet.\n> `{p}newpack <name>` to create one', pt: '📦 Você ainda não tem pacotes.\n> `{p}newpack <nome>` para criar um' },
  titulo:     { es: 'TUS PAQUETES', en: 'YOUR PACKS', pt: 'SEUS PACOTES' },
  sueltos:    { es: '│ Sueltos (#savesticker): {c}', en: '│ Loose (#savesticker): {c}', pt: '│ Soltas (#savesticker): {c}' },
  pie:        { es: '> `{p}getpack <nombre>` · `{p}stickeradd <nombre>` · `{p}delpack <nombre>`', en: '> `{p}getpack <name>` · `{p}stickeradd <name>` · `{p}delpack <name>`', pt: '> `{p}getpack <nome>` · `{p}stickeradd <nome>` · `{p}delpack <nome>`' },
  vacio:      { es: '📦 *{n}* está vacío. Citá un sticker con `{p}stickeradd {n}`.', en: '📦 *{n}* is empty. Quote a sticker with `{p}stickeradd {n}`.', pt: '📦 *{n}* está vazio. Cite uma figurinha com `{p}stickeradd {n}`.' },
  enviando:   { es: '📦 *{n}* — {c} sticker(s):', en: '📦 *{n}* — {c} sticker(s):', pt: '📦 *{n}* — {c} figurinha(s):' },
  perdidos:   { es: '> {c} ya no estaban en el disco y los saqué del paquete.', en: '> {c} were no longer on disk and I removed them from the pack.', pt: '> {c} não estavam mais no disco e tirei do pacote.' },
  borrado:    { es: '🗑️ Borraste el paquete *{n}* y sus {c} sticker(s).', en: '🗑️ You deleted the pack *{n}* and its {c} sticker(s).', pt: '🗑️ Você apagou o pacote *{n}* e suas {c} figurinha(s).' },
  usoNombre:  { es: '✗ Uso: `{p}{cmd} <paquete>`', en: '✗ Usage: `{p}{cmd} <pack>`', pt: '✗ Uso: `{p}{cmd} <pacote>`' },
}

const responder = (ctx: BotContext, text: string) =>
  safeSend(() => ctx.sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg }))

/** El nombre del paquete tal como lo guardó el usuario, buscándolo sin mayúsculas. */
const paquete = (u: UserData, nombre: string) =>
  (u.stickerPacks ?? []).find(p => p.toLowerCase() === nombre.trim().toLowerCase())

const deUnPaquete = (u: UserData, p: string) => (u.savedStickers ?? []).filter(s => s.pack === p)

function crear(u: UserData, nombre: string): string {
  u.stickerPacks = [...(u.stickerPacks ?? []), nombre]
  return nombre
}

const newpack: Command = {
  name: 'newpack', aliases: ['nuevopack', 'newstickerpack', 'crearpack'], category: 'sticker', cooldown: 3,
  description: 'Crea un paquete de stickers  |  !newpack <nombre>',
  async execute(ctx) {
    const nombre = ctx.args.join(' ').trim()
    const u = getUserData(ctx.sender)
    if (!nombre) return void await responder(ctx, tx(ctx.lang, T.usoNuevo, { p: ctx.prefix }))
    if ([...nombre].length > MAX_NOMBRE) return void await responder(ctx, tx(ctx.lang, T.largo, { n: MAX_NOMBRE }))
    if (paquete(u, nombre)) return void await responder(ctx, tx(ctx.lang, T.yaExiste, { n: paquete(u, nombre) }))
    if ((u.stickerPacks ?? []).length >= MAX_PAQUETES) return void await responder(ctx, tx(ctx.lang, T.maxPaq, { n: MAX_PAQUETES, p: ctx.prefix }))
    crear(u, nombre)
    await responder(ctx, tx(ctx.lang, T.creado, { n: nombre, p: ctx.prefix }))
  },
}

const stickeradd: Command = {
  name: 'stickeradd', aliases: ['addsticker', 'agregarsticker'], category: 'sticker', cooldown: 3,
  description: 'Agrega un sticker a un paquete, citándolo  |  !stickeradd <paquete>',
  async execute(ctx) {
    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const nombre = ctx.args.join(' ').trim()
    if (!quoted?.stickerMessage || !nombre) return void await responder(ctx, tx(ctx.lang, T.usoAdd, { p: ctx.prefix }))
    const u = getUserData(ctx.sender)
    // Un paquete que no existe se crea: es lo que quiere quien escribe esto.
    let p = paquete(u, nombre)
    if (!p) {
      if ([...nombre].length > MAX_NOMBRE) return void await responder(ctx, tx(ctx.lang, T.largo, { n: MAX_NOMBRE }))
      if ((u.stickerPacks ?? []).length >= MAX_PAQUETES) return void await responder(ctx, tx(ctx.lang, T.maxPaq, { n: MAX_PAQUETES, p: ctx.prefix }))
      p = nombre
    }
    const enEste = deUnPaquete(u, p).length
    if (enEste >= MAX_POR_PAQUETE) return void await responder(ctx, tx(ctx.lang, T.lleno, { n: p, max: MAX_POR_PAQUETE }))
    if ((u.savedStickers ?? []).length >= MAX_GUARDADOS) return void await responder(ctx, tx(ctx.lang, T.maxTotal, { n: MAX_GUARDADOS }))

    const webp = await downloadMediaMessage({ ...ctx.msg, message: quoted } as any, 'buffer', {}) as Buffer
    const { id, path } = await saveStickerFile(ctx.sender, webp)
    // Se vuelve a pedir el usuario: durante la descarga otro comando pudo
    // hacer patchUserData, que lo reemplaza por un objeto nuevo, y escribir en
    // el viejo se perdería.
    const vivo = getUserData(ctx.sender)
    if (!paquete(vivo, p)) crear(vivo, p)
    const entrada: SavedSticker = { id, name: `${p} ${deUnPaquete(vivo, p).length + 1}`, path, savedAt: Date.now(), pack: p }
    vivo.savedStickers = [...(vivo.savedStickers ?? []), entrada]
    await responder(ctx, tx(ctx.lang, T.agregado, { n: p, c: deUnPaquete(vivo, p).length, max: MAX_POR_PAQUETE }))
  },
}

const stickerdel: Command = {
  name: 'stickerdel', aliases: ['quitarsticker', 'packdel'], category: 'sticker', cooldown: 3,
  description: 'Quita un sticker de un paquete  |  !stickerdel <paquete> <número>',
  async execute(ctx) {
    const i = Number(ctx.args.at(-1))
    const nombre = ctx.args.slice(0, -1).join(' ')
    if (!Number.isInteger(i) || i < 1 || !nombre) return void await responder(ctx, tx(ctx.lang, T.usoDel, { p: ctx.prefix }))
    const u = getUserData(ctx.sender)
    const p = paquete(u, nombre)
    if (!p) return void await responder(ctx, tx(ctx.lang, T.noPaquete, { n: nombre, p: ctx.prefix }))
    const lista = deUnPaquete(u, p)
    const quitar = lista[i - 1]
    if (!quitar) return void await responder(ctx, tx(ctx.lang, T.noNumero, { n: p, i, c: lista.length }))
    u.savedStickers = (u.savedStickers ?? []).filter(s => s !== quitar)
    await deleteStickerFile(quitar.path)
    await responder(ctx, tx(ctx.lang, T.quitado, { n: p, i }))
  },
}

const stickerpacks: Command = {
  name: 'stickerpacks', aliases: ['packs', 'packlist', 'mispacks', 'paquetes'], category: 'sticker', cooldown: 3,
  description: 'Tus paquetes de stickers',
  async execute(ctx) {
    const u = getUserData(ctx.sender)
    const packs = u.stickerPacks ?? []
    if (!packs.length) return void await responder(ctx, tx(ctx.lang, T.ninguno, { p: ctx.prefix }))
    const sueltos = (u.savedStickers ?? []).filter(s => !s.pack).length
    await responder(ctx, [
      `╭─「 📦 ${tx(ctx.lang, T.titulo)} — ${packs.length} 」`,
      `│`,
      ...packs.map(p => `│ 📦 *${p}*  ${deUnPaquete(u, p).length}/${MAX_POR_PAQUETE}`),
      ...(sueltos ? [`│`, tx(ctx.lang, T.sueltos, { c: sueltos })] : []),
      `│`,
      tx(ctx.lang, T.pie, { p: ctx.prefix }),
      `╰─`,
    ].join('\n'))
  },
}

const getpack: Command = {
  name: 'getpack', aliases: ['pack', 'verpack', 'enviarpack'], category: 'sticker', cooldown: 30,
  description: 'Manda los stickers de uno de tus paquetes  |  !getpack <paquete>',
  async execute(ctx) {
    const nombre = ctx.args.join(' ').trim()
    if (!nombre) return void await responder(ctx, tx(ctx.lang, T.usoNombre, { p: ctx.prefix, cmd: 'getpack' }))
    const u = getUserData(ctx.sender)
    const p = paquete(u, nombre)
    if (!p) return void await responder(ctx, tx(ctx.lang, T.noPaquete, { n: nombre, p: ctx.prefix }))
    const lista = deUnPaquete(u, p)
    if (!lista.length) return void await responder(ctx, tx(ctx.lang, T.vacio, { n: p, p: ctx.prefix }))

    await responder(ctx, tx(ctx.lang, T.enviando, { n: p, c: lista.length }))
    const perdidos: SavedSticker[] = []
    for (const s of lista) {
      const sticker = await readStickerFile(s.path)
      if (!sticker) { perdidos.push(s); continue }
      // De a uno: el limitador de salida (egress) espacia los envíos.
      await safeSend(() => ctx.sock.sendMessage(ctx.jid, { sticker }))
    }
    if (perdidos.length) {
      // Por id y sobre el usuario de ahora: los envíos tardaron (ver stickeradd).
      const ids = new Set(perdidos.map(s => s.id))
      const vivo = getUserData(ctx.sender)
      vivo.savedStickers = (vivo.savedStickers ?? []).filter(s => !ids.has(s.id))
      await responder(ctx, tx(ctx.lang, T.perdidos, { c: perdidos.length }))
    }
  },
}

const delpack: Command = {
  name: 'delpack', aliases: ['borrarpack', 'eliminarpack'], category: 'sticker', cooldown: 3,
  description: 'Borra un paquete y sus stickers  |  !delpack <paquete>',
  async execute(ctx) {
    const nombre = ctx.args.join(' ').trim()
    if (!nombre) return void await responder(ctx, tx(ctx.lang, T.usoNombre, { p: ctx.prefix, cmd: 'delpack' }))
    const u = getUserData(ctx.sender)
    const p = paquete(u, nombre)
    if (!p) return void await responder(ctx, tx(ctx.lang, T.noPaquete, { n: nombre, p: ctx.prefix }))
    const lista = deUnPaquete(u, p)
    u.savedStickers = (u.savedStickers ?? []).filter(s => s.pack !== p)
    u.stickerPacks = (u.stickerPacks ?? []).filter(x => x !== p)
    await Promise.all(lista.map(s => deleteStickerFile(s.path)))
    await responder(ctx, tx(ctx.lang, T.borrado, { n: p, c: lista.length }))
  },
}

export default [newpack, stickeradd, stickerdel, stickerpacks, getpack, delpack]
