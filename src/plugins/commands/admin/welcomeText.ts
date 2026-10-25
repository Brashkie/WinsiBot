import type { Command, BotContext } from '../../../types/index.js'
import { getGroupConfig } from '@core/events.js'
import { textoDe } from '@core/events/welcome.js'
import { safeSend, sendWithMedia } from '@lib/media_sender.js'
import { tx } from '@lib/i18n.js'

// El texto de bienvenida y de despedida de cada grupo. welcome.ts los usaba
// desde siempre (sWelcome, sBye), pero no había comando para escribirlos: todos
// los grupos tenían el de siempre. Variables: @user @group @desc @count.

const MAX = 1000

const T = {
  uso:     { es: '✗ Uso: `{p}{cmd} <texto>`\n> Variables: @user (la mención), @group (el nombre del grupo), @desc (su descripción), @count (cuántos son)', en: '✗ Usage: `{p}{cmd} <text>`\n> Variables: @user (the mention), @group (group name), @desc (its description), @count (how many)', pt: '✗ Uso: `{p}{cmd} <texto>`\n> Variáveis: @user (a menção), @group (nome do grupo), @desc (a descrição), @count (quantos são)' },
  largo:   { es: '✗ Hasta {n} caracteres.', en: '✗ Up to {n} characters.', pt: '✗ Até {n} caracteres.' },
  listo:   { es: '✅ Guardado. Probalo con `{p}testwelcome`{extra}.', en: '✅ Saved. Try it with `{p}testwelcome`{extra}.', pt: '✅ Salvo. Teste com `{p}testwelcome`{extra}.' },
  apagado: { es: ' (los avisos de bienvenida están apagados: `{p}welcome on`)', en: ' (welcome messages are off: `{p}welcome on`)', pt: ' (os avisos de boas-vindas estão desligados: `{p}welcome on`)' },
  borrado: { es: '✅ Bienvenida y despedida vuelven a las de siempre.', en: '✅ Welcome and goodbye are back to the default ones.', pt: '✅ Boas-vindas e despedida voltam às de sempre.' },
}

const responder = (ctx: BotContext, text: string) =>
  safeSend(() => ctx.sock.sendMessage(ctx.jid, { text }, { quoted: ctx.msg }))

function guardar(campo: 'sWelcome' | 'sBye', cmd: string): Command['execute'] {
  return async (ctx) => {
    // El texto tal cual, con sus saltos de línea: los args vienen partidos por espacios.
    const texto = ctx.text.slice(ctx.prefix.length).trim().slice(ctx.command.length).trim()
    if (!texto) return void await responder(ctx, tx(ctx.lang, T.uso, { p: ctx.prefix, cmd }))
    if ([...texto].length > MAX) return void await responder(ctx, tx(ctx.lang, T.largo, { n: MAX }))
    const g = getGroupConfig(ctx.jid)
    g[campo] = texto
    await responder(ctx, tx(ctx.lang, T.listo, { p: ctx.prefix, extra: g.welcome ? '' : tx(ctx.lang, T.apagado, { p: ctx.prefix }) }))
  }
}

const setwelcome: Command = {
  name: 'setwelcome', aliases: ['setbienvenida', 'bienvenidatexto'], category: 'admin', cooldown: 3,
  groupOnly: true, adminOnly: true,
  description: 'El texto de bienvenida del grupo  |  !setwelcome Hola @user, bienvenid@ a @group',
  execute: guardar('sWelcome', 'setwelcome'),
}

const setbye: Command = {
  name: 'setbye', aliases: ['setdespedida', 'setgoodbye'], category: 'admin', cooldown: 3,
  groupOnly: true, adminOnly: true,
  description: 'El texto de despedida del grupo  |  !setbye Chau @user',
  execute: guardar('sBye', 'setbye'),
}

const delwelcome: Command = {
  name: 'delwelcome', aliases: ['resetwelcome', 'delbye', 'borrarbienvenida'], category: 'admin', cooldown: 3,
  groupOnly: true, adminOnly: true,
  description: 'Vuelve a la bienvenida y la despedida de siempre',
  async execute(ctx) {
    const g = getGroupConfig(ctx.jid)
    g.sWelcome = ''
    g.sBye = ''
    await responder(ctx, tx(ctx.lang, T.borrado))
  },
}

const testwelcome: Command = {
  name: 'testwelcome', aliases: ['testbye', 'testgoodbye', 'probarbienvenida'], category: 'admin', cooldown: 10,
  groupOnly: true, adminOnly: true,
  description: 'Muestra la bienvenida (o la despedida, con #testbye) como si entraras vos',
  async execute(ctx) {
    const tipo = ['testbye', 'testgoodbye'].includes(ctx.command) ? 'bye' : 'welcome'
    const caption = await textoDe(ctx.sock, ctx.jid, ctx.sender, tipo)
    await sendWithMedia(ctx.sock, ctx.jid, caption, 'WinsiBot', undefined, false, [ctx.sender])
  },
}

export default [setwelcome, setbye, delwelcome, testwelcome]
