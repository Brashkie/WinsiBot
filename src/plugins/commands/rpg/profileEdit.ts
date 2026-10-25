import type { Command, BotContext } from '../../../types/index.js'
import { getUserData } from '@core/events.js'
import { safeSend } from '@lib/media_sender.js'
import { tx } from '@lib/i18n.js'

// La descripción y el género del perfil. #perfil los mostraba desde siempre,
// pero no había ningún comando para ponerlos.

const MAX_DESC = 140

const T = {
  usoDesc:   { es: '✗ Uso: `{p}setdesc <texto>` (hasta {n} caracteres)', en: '✗ Usage: `{p}setdesc <text>` (up to {n} characters)', pt: '✗ Uso: `{p}setdesc <texto>` (até {n} caracteres)' },
  largo:     { es: '✗ Hasta {n} caracteres; esa tiene {c}.', en: '✗ Up to {n} characters; that one has {c}.', pt: '✗ Até {n} caracteres; essa tem {c}.' },
  descLista: { es: '✅ Descripción guardada. Se ve en `{p}perfil`.', en: '✅ Description saved. It shows in `{p}perfil`.', pt: '✅ Descrição salva. Aparece em `{p}perfil`.' },
  descBorr:  { es: '✅ Borraste tu descripción.', en: '✅ You deleted your description.', pt: '✅ Você apagou sua descrição.' },
  usoGen:    { es: '✗ Uso: `{p}setgenre hombre | mujer | otro`', en: '✗ Usage: `{p}setgenre man | woman | other`', pt: '✗ Uso: `{p}setgenre homem | mulher | outro`' },
  genLista:  { es: '✅ Género guardado. Se ve en `{p}perfil`.', en: '✅ Gender saved. It shows in `{p}perfil`.', pt: '✅ Gênero salvo. Aparece em `{p}perfil`.' },
  genBorr:   { es: '✅ Borraste tu género del perfil.', en: '✅ You removed your gender from your profile.', pt: '✅ Você tirou seu gênero do perfil.' },
}

const responder = (ctx: BotContext, text: string) =>
  safeSend(() => ctx.sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg }))

/** 'm', 'f', u 'o' (otro): lo que guarda el perfil (ver profile.ts). */
function leerGenero(s: string): 'm' | 'f' | 'o' | null {
  const v = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (['hombre', 'h', 'm', 'masculino', 'man', 'male', 'homem'].includes(v)) return 'm'
  if (['mujer', 'f', 'femenino', 'woman', 'female', 'mulher'].includes(v)) return 'f'
  if (['otro', 'otra', 'o', 'other', 'outro', 'no binario', 'nobinario', 'nb'].includes(v)) return 'o'
  return null
}

const setdesc: Command = {
  name: 'setdesc', aliases: ['setdescription', 'setdescripcion', 'descripcion'], category: 'rpg', cooldown: 5,
  description: 'Tu descripción en el perfil  |  !setdesc <texto>',
  async execute(ctx) {
    const texto = ctx.args.join(' ').replace(/\s+/g, ' ').trim()
    if (!texto) return void await responder(ctx, tx(ctx.lang, T.usoDesc, { p: ctx.prefix, n: MAX_DESC }))
    const largo = [...texto].length
    if (largo > MAX_DESC) return void await responder(ctx, tx(ctx.lang, T.largo, { n: MAX_DESC, c: largo }))
    getUserData(ctx.sender).profile.description = texto
    await responder(ctx, tx(ctx.lang, T.descLista, { p: ctx.prefix }))
  },
}

const deldesc: Command = {
  name: 'deldesc', aliases: ['deldescription', 'borrardesc'], category: 'rpg', cooldown: 5,
  description: 'Borra tu descripción del perfil',
  async execute(ctx) {
    getUserData(ctx.sender).profile.description = ''
    await responder(ctx, tx(ctx.lang, T.descBorr))
  },
}

const setgenre: Command = {
  name: 'setgenre', aliases: ['setgenero', 'genero', 'setgender'], category: 'rpg', cooldown: 5,
  description: 'Tu género en el perfil  |  !setgenre hombre | mujer | otro',
  async execute(ctx) {
    const g = leerGenero(ctx.args.join(' '))
    if (!g) return void await responder(ctx, tx(ctx.lang, T.usoGen, { p: ctx.prefix }))
    getUserData(ctx.sender).profile.genre = g
    await responder(ctx, tx(ctx.lang, T.genLista, { p: ctx.prefix }))
  },
}

const delgenre: Command = {
  name: 'delgenre', aliases: ['delgenero', 'delgender'], category: 'rpg', cooldown: 5,
  description: 'Borra tu género del perfil',
  async execute(ctx) {
    getUserData(ctx.sender).profile.genre = ''
    await responder(ctx, tx(ctx.lang, T.genBorr))
  },
}

export default [setdesc, deldesc, setgenre, delgenre]
