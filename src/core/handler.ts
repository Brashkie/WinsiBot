import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { commandRegistry } from '@plugins/commands/index.js'
import { applyMiddlewares } from '@plugins/middlewares/index.js'
import { config } from '@config'
import { logger } from './logger.js'
import chalk from 'chalk'
import type { BotContext } from '../types/index.js'
import { handleNotFound } from '@plugins/commands/general/notfound.js'
import { pythonGet, pythonPost, fastProcess } from '@lib/pythonBridge.js'
import { safeSend } from '@lib/media_sender.js'
import {
  addXP,
  checkSpam,
  handleSpam,
  getGroupConfig,
  getUserData,
  setUserData,
} from '@core/events.js'

// ─── Bots conocidos a ignorar ─────────────────────────────────────────────────
const KNOWN_BOTS = new Set([
  '+50251513940@s.whatsapp.net',
  '50251513940@s.whatsapp.net',
])

// ─── Cache de groupMetadata en RAM con límite LRU ────────────────────────────
const GROUP_META_TTL = 5 * 60 * 1000
const GROUP_META_MAX = 500

const groupMetaCache = new Map<string, {
  participants: any[]
  ts:           number
}>()

function pruneGroupMetaCache(): void {
  const now = Date.now()
  for (const [jid, entry] of groupMetaCache) {
    if (now - entry.ts > GROUP_META_TTL) groupMetaCache.delete(jid)
  }
  if (groupMetaCache.size > GROUP_META_MAX) {
    let excess = groupMetaCache.size - GROUP_META_MAX
    for (const key of groupMetaCache.keys()) {
      if (excess-- <= 0) break
      groupMetaCache.delete(key)
    }
  }
}

setInterval(pruneGroupMetaCache, GROUP_META_TTL).unref()

async function getGroupMetaCached(sock: WASocket, jid: string): Promise<any[]> {
  const cached = groupMetaCache.get(jid)
  if (cached && Date.now() - cached.ts < GROUP_META_TTL) {
    return cached.participants
  }
  try {
    const metadata = await sock.groupMetadata(jid)
    groupMetaCache.set(jid, {
      participants: metadata.participants,
      ts:           Date.now(),
    })
    if (groupMetaCache.size > GROUP_META_MAX) pruneGroupMetaCache()
    return metadata.participants
  } catch {
    return cached?.participants ?? []
  }
}

export function invalidateGroupCache(jid: string): void {
  groupMetaCache.delete(jid)
}

// ─── Extraer texto del mensaje ────────────────────────────────────────────────
function extractText(msg: WAMessage): string {
  return (
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.message?.imageMessage?.caption ??
    msg.message?.videoMessage?.caption ??
    ''
  )
}

// ─── Construir contexto base ──────────────────────────────────────────────────
function buildBaseContext(
  msg:  WAMessage,
  sock: WASocket,
): Omit<BotContext, 'isAdmin' | 'isBotAdmin'> {
  const jid     = msg.key.remoteJid ?? ''
  const isGroup = jid.endsWith('@g.us')
  const sender  = isGroup
    ? (msg.key.participant ?? '')
    : (msg.key.remoteJid  ?? '')
  const text    = extractText(msg).trim()

  const senderNum = sender
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/[^0-9]/g, '')

  const isOwner = config.ownerJid.some(o =>
    o === sender ||
    o.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') === senderNum
  )

  const usedPrefix = config.prefix.find(p => text.startsWith(p)) ?? ''
  const hasPrefix  = usedPrefix.length > 0
  const [rawCmd = '', ...args] = hasPrefix
    ? text.slice(usedPrefix.length).trim().split(/\s+/)
    : []

  return {
    msg,
    sock,
    jid,
    text,
    args,
    isGroup,
    sender,
    isOwner,
    prefix:   usedPrefix,
    command:  rawCmd.toLowerCase(),
    pushName: msg.pushName ?? '',
  }
}

// ─── Resolver roles del grupo con cache ───────────────────────────────────────
async function resolveGroupRoles(
  sock:   WASocket,
  jid:    string,
  sender: string,
): Promise<{ isAdmin: boolean; isBotAdmin: boolean }> {
  try {
    const participants = await getGroupMetaCached(sock, jid)

    const senderP = participants.find((p: any) =>
      p.id === sender || (p as any).lid === sender
    )
    const botJid = (sock.user?.id ?? '').split(':')[0] + '@s.whatsapp.net'
    const botP   = participants.find((p: any) =>
      p.id === botJid ||
      p.id === sock.user?.id ||
      (p as any).lid === sock.user?.id
    )

    return {
      isAdmin:    senderP?.admin === 'admin' || senderP?.admin === 'superadmin',
      isBotAdmin: botP?.admin   === 'admin' || botP?.admin   === 'superadmin',
    }
  } catch {
    return { isAdmin: false, isBotAdmin: false }
  }
}

// ─── AI triggers ──────────────────────────────────────────────────────────────
const AI_TRIGGERS = new Set([
  'hepein', 'brashkie', 'bot', 'winsi', 'winsito',
])

function isAITrigger(text: string, botName: string): boolean {
  const lower = text.toLowerCase().trim()
  const words = lower.split(/\s+/)

  // trigger en cualquier posición del texto
  if (words.some(w => AI_TRIGGERS.has(w))) return true

  // nombre del bot mencionado
  if (lower.includes(botName.toLowerCase())) return true

  return false
}

// ─── Pipeline de IA ───────────────────────────────────────────────────────────
async function handleAIResponse(
  ctx:  BotContext,
  sock: WASocket,
  msg:  WAMessage,
): Promise<boolean> {
  try {
    // 1. clasificar intención
    const intentRes = await pythonPost<{
      intent:      string
      confidence:  number
      is_spam:     boolean
      is_insult:   boolean
    }>('/api/v1/ai/intent/classify', {
      text:            ctx.text,
      use_transformer: false,
    }).catch(() => null)

    const intent = intentRes?.data?.intent ?? 'neutral'

    // no responder a spam o nsfw
    if (intent === 'spam' || intent === 'nsfw') return false

    // 2. actualizar memoria del usuario y obtener contexto
    const memRes = await pythonPost<Record<string, any>>(
      `/api/v1/ai/memory/${encodeURIComponent(ctx.sender)}/update`,
      { text: ctx.text, intent, is_cmd: false }
    ).catch(() => null)

    const context = memRes?.data ?? {}

    // 3. generar respuesta con personalidad
    const replyRes = await pythonPost<string>(
      '/api/v1/ai/personality/respond',
      {
        intent,
        text:      ctx.text,
        context,
        jid:       ctx.jid,
        use_humor: true,
      }
    ).catch(() => null)

    const reply = typeof replyRes?.data === 'string'
      ? replyRes.data.trim()
      : null

    if (!reply) return false

    await safeSend(() => sock.sendMessage(ctx.jid, {
      text: reply,
    }, { quoted: msg }))

    return true
  } catch (err) {
    logger.warn({ err }, 'handleAIResponse error')
    return false
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function handleMessage(msg: WAMessage, sock: WASocket): Promise<void> {
  try {
    const jidEarly = msg.key.remoteJid ?? ''
    const textEarly = (
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      msg.message?.imageMessage?.caption ??
      msg.message?.videoMessage?.caption ??
      ''
    ).trim()

    const isGroupEarly  = jidEarly.endsWith('@g.us')
    const chatLabel     = isGroupEarly ? chalk.magenta('Grupo') : chalk.yellow('Privado')
    const meLabel       = msg.key.fromMe ? chalk.gray('fromMe') : chalk.cyan('entrante')
    const textLabel     = textEarly ? chalk.white(`"${textEarly.slice(0, 50)}"`) : chalk.gray('(sin texto)')
    console.log(`  ${chalk.green('◈')} ${chalk.white.bold('Handler')}  ${chatLabel} ${chalk.gray(jidEarly.replace('@g.us','').replace('@s.whatsapp.net',''))}  ${meLabel}  ${textLabel}`)

    if (msg.key.fromMe) return

    const base = buildBaseContext(msg, sock)
    if (!base.jid || base.jid === 'status@broadcast') return

    if (KNOWN_BOTS.has(base.sender)) return

    const [rolesResult, fastResult] = await Promise.allSettled([
      base.isGroup
        ? resolveGroupRoles(sock, base.jid, base.sender)
        : Promise.resolve({ isAdmin: false, isBotAdmin: false }),
      Promise.race([
        fastProcess(base.text, config.prefix, base.sender, base.jid, config.ownerJid),
        new Promise<null>(r => setTimeout(() => r(null), 500)),
      ]),
    ])

    const roles = rolesResult.status === 'fulfilled'
      ? rolesResult.value
      : { isAdmin: false, isBotAdmin: false }

    const fast = fastResult.status === 'fulfilled' ? fastResult.value : null

    const ctx: BotContext = {
      ...base,
      isAdmin:    roles.isAdmin,
      isBotAdmin: roles.isBotAdmin,
      isOwner:    fast?.is_owner ?? base.isOwner,
    }

    if (fast && !fast.allowed && !ctx.isOwner) {
      console.log(`  ${chalk.red('◈')} ${chalk.red.bold('Bloqueado')}  ${chalk.gray(base.sender.replace('@s.whatsapp.net','').replace('@lid',''))}  ${chalk.gray('fast.allowed=false')}`)
      return
    }

    const passed = await applyMiddlewares(ctx)
    if (!passed) return

    const user = getUserData(ctx.sender, ctx.pushName)

    // ─── Usuario baneado ──────────────────────────────────────────────────────
    if (user.banned && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: `✗ Estas baneado\n§ Motivo: ${user.banReason || 'Sin especificar'}`,
      }, { quoted: msg }))
      return
    }

    if (ctx.sender) {
      addXP(sock, ctx.jid, ctx.sender, ctx.pushName)
    }

    // ─── Anti-spam de flood ───────────────────────────────────────────────────
    if (ctx.isGroup && !ctx.isOwner && !ctx.isAdmin) {
      const isSpam = checkSpam(ctx.sender, ctx.jid)
      if (isSpam) {
        await handleSpam(sock, ctx.jid, ctx.sender)
        return
      }
    }

    // ─── Auto-moderacion ──────────────────────────────────────────────────────
    if (ctx.isGroup && !ctx.isOwner && !ctx.isAdmin) {
      const groupCfg = getGroupConfig(ctx.jid)

      if (groupCfg.muted) return

      if (groupCfg.antilink) {
        const hasLink = /https?:\/\/|wa\.me\/|chat\.whatsapp\.com|t\.me\//i.test(ctx.text)
        if (hasLink) {
          await safeSend(() => sock.sendMessage(ctx.jid, { delete: msg.key })).catch(() => {})
          const num = ctx.sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
          await safeSend(() => sock.sendMessage(ctx.jid, {
            text:     `§ @${num} los links no estan permitidos`,
            mentions: [ctx.sender],
          }, { quoted: msg }))
          return
        }
      }

      if (groupCfg.antispam && ctx.text.length > 10) {
        const spamResult = await pythonGet<{ is_spam: boolean; confidence: number }>(
          '/api/v1/ml/predict/spam', { text: ctx.text }
        ).catch(() => null)
        if (spamResult?.data?.is_spam && (spamResult.data.confidence ?? 0) > 0.85) {
          const num = ctx.sender.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
          await safeSend(() => sock.sendMessage(ctx.jid, {
            text:     `§ @${num} mensaje detectado como spam`,
            mentions: [ctx.sender],
          }))
          return
        }
      }
    }

    // ─── Sin prefijo — verificar si es trigger de IA ──────────────────────────
    if (!config.prefix.some(p => ctx.text.startsWith(p))) {
      if (ctx.text && ctx.isGroup) {
        const groupCfg = getGroupConfig(ctx.jid)
        if (groupCfg.hepein) {
          const botName = sock.user?.name ?? 'hepein'
          if (isAITrigger(ctx.text, botName)) {
            await handleAIResponse(ctx, sock, msg)
          }
        }
      }
      // en privado siempre responde si es trigger
      if (ctx.text && !ctx.isGroup) {
        const botName = sock.user?.name ?? 'hepein'
        if (isAITrigger(ctx.text, botName)) {
          await handleAIResponse(ctx, sock, msg)
        }
      }
      return
    }

    // ─── Procesar comando ─────────────────────────────────────────────────────
    const command =
      commandRegistry.get(ctx.command) ??
      [...commandRegistry.values()].find(c => c.aliases?.includes(ctx.command))

    if (!command) {
      await handleNotFound(ctx)
      return
    }

    // ─── Validaciones del comando ─────────────────────────────────────────────
    if (command.ownerOnly && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: '✗ Solo el owner puede usar este comando.',
      }, { quoted: msg }))
      return
    }

    if (command.groupOnly && !ctx.isGroup) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: '✗ Este comando solo funciona en grupos.',
      }, { quoted: msg }))
      return
    }

    if (command.adminOnly && !ctx.isAdmin && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: '✗ Solo los administradores pueden usar este comando.',
      }, { quoted: msg }))
      return
    }

    if (ctx.isGroup) {
      const groupCfg = getGroupConfig(ctx.jid)
      if (groupCfg.modoadmin && !ctx.isAdmin && !ctx.isOwner) return
    }

    if (command.premiumOnly && !user.premium && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: '✗ Este comando es solo para usuarios *premium*.',
      }, { quoted: msg }))
      return
    }

    if (command.register && !user.registered) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: `✗ Necesitas registrarte.\n§ Usa: ${ctx.prefix}registro`,
      }, { quoted: msg }))
      return
    }

    if (command.level && user.level < command.level) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: `✗ Necesitas nivel *${command.level}*\n§ Tu nivel: ${user.level}`,
      }, { quoted: msg }))
      return
    }

    if (command.limit && !user.premium && !ctx.isOwner && user.diamonds < command.limit) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: `✗ No tienes suficientes diamantes.\n§ Costo: ${command.limit} ◆  Tienes: ${user.diamonds} ◆`,
      }, { quoted: msg }))
      return
    }

    if (command.money && !user.premium && !ctx.isOwner && user.money < command.money) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: `✗ No tienes suficientes monedas.\n§ Costo: ${command.money}  Tienes: ${user.money}`,
      }, { quoted: msg }))
      return
    }

    // ─── Ejecutar comando ─────────────────────────────────────────────────────
    logger.info({ cmd: ctx.command, sender: ctx.sender, jid: ctx.jid }, 'Comando ejecutado')
    await command.execute(ctx)

    // ─── Post-ejecucion ───────────────────────────────────────────────────────
    const xpGain = command.exp ?? 10
    setUserData(ctx.sender, {
      exp:      user.exp + xpGain,
      diamonds: command.limit ? user.diamonds - command.limit : user.diamonds,
      money:    command.money ? user.money    - command.money : user.money,
    })

  } catch (err: any) {
    const msg_ = err?.message ?? ''
    if (msg_.includes('Connection Closed') || msg_.includes('Connection Lost')) {
      logger.warn({ msg: msg_ }, 'Conexion caida durante mensaje — Baileys reconectara')
      return
    }
    logger.error({ err }, 'Error en handleMessage')
  }
}