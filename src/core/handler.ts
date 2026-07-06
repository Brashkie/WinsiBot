import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { commandRegistry } from '@plugins/commands/index.js'
import { applyMiddlewares } from '@plugins/middlewares/index.js'
import { config } from '@config'
import { logger } from './logger.js'
import { color, themes } from 'ansimax'
import type { BotContext } from '../types/index.js'
import { handleNotFound } from '@plugins/commands/general/notfound.js'
import { pythonGet, pythonPost, fastProcess, analyzeIntent, learnConversation } from '@lib/pythonBridge.js'
import { hepein } from '@lib/hepein.js'
import { safeSend } from '@lib/media_sender.js'
import {
  addXP,
  checkSpam,
  handleSpam,
  getGroupConfig,
  getUserData,
  setUserData,
  checkLevelUp,
} from '@core/events.js'
import { hasPendingCaptcha, verifyCaptchaAnswer } from '@core/events/captcha.js'
import { handleDrawGuessMessage, handleQuizMessage } from '@core/events/gameHandlers.js'
import { sessionClient } from '@lib/session.js'
import { getGroupParticipants } from '@core/groupCache.js'

// ─── Bots conocidos a ignorar ─────────────────────────────────────────────────
const KNOWN_BOTS = new Set([
  '+50251513940@s.whatsapp.net',
  '50251513940@s.whatsapp.net',
])

// ─── Semáforo de concurrencia ─────────────────────────────────────────────────
// Sin esto, en grupos muy activos se crean 100+ Promises concurrentes haciendo
// HTTP calls a Rust/Python, agotando el event loop y causando timeouts en cascada.
const MAX_CONCURRENT    = 25
const MAX_QUEUE_WAIT_MS = 3_000 // espera acotada por un cupo antes de descartar
let _activeHandlers     = 0

// ─── Extraer texto del mensaje ────────────────────────────────────────────────
function extractText(msg: WAMessage): string {
  // Respuesta a botón interactivo (quick_reply del carrusel/botones nativos)
  // paramsJson = '{"id":"!tiktok https://...","display_text":"Descargar"}'
  const nfParams = (msg.message as any)?.interactiveResponseMessage
    ?.nativeFlowResponseMessage?.paramsJson
  if (typeof nfParams === 'string') {
    try {
      const p = JSON.parse(nfParams) as { id?: string }
      if (p.id) return p.id
    } catch { /* ignore */ }
  }

  // Respuesta a botón antiguo (buttonsMessage)
  const btnId = (msg.message as any)?.buttonsResponseMessage?.selectedButtonId
  if (typeof btnId === 'string' && btnId) return btnId

  // Respuesta a template button
  const tplId = (msg.message as any)?.templateButtonReplyMessage?.selectedId
  if (typeof tplId === 'string' && tplId) return tplId

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
    const participants = await getGroupParticipants(sock, jid)

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
  if (words.some(w => AI_TRIGGERS.has(w))) return true
  if (lower.includes(botName.toLowerCase())) return true
  return false
}

// ─── Fallback local (cuando Python está offline) ──────────────────────────────
const FALLBACK_RESPONSES: Record<string, string[]> = {
  greeting:        [
    '¡Hola! ¿En qué te puedo ayudar? 😊',
    '¡Buenas! Dime qué necesitas',
    '¡Hey! ¿Qué tal? 👋',
  ],
  farewell:        ['¡Hasta luego! 👋', '¡Chao! Cuídate 😊'],
  insult:          [
    'Oye, tranquilo 😅 ¿Puedo ayudarte en algo?',
    'Sin malos rollos, ¿qué necesitas?',
  ],
  question:        [
    '¿Me das más detalles? 🤔',
    'Cuéntame más para ayudarte mejor',
  ],
  command_attempt: [
    `¿Buscas un comando? Escribe \`${config.prefix[0] ?? '!'}menu\``,
    `Usa \`${config.prefix[0] ?? '!'}menu\` para ver todos los comandos`,
  ],
  nonsense:        ['No entendí bien, ¿puedes repetir? 🤔', 'Hmm, ¿puedes explicarme mejor?'],
  spam:            ['¡Tranquilo! Uno a la vez 😄'],
  nsfw:            ['Eso no lo manejo 😅'],
  neutral:         [
    '¡Sí! ¿En qué te ayudo? 😊',
    'Aquí estoy, dime',
    '¿Qué necesitas? 😊',
  ],
}

function localFallback(intent: string): string {
  const pool = FALLBACK_RESPONSES[intent] ?? FALLBACK_RESPONSES['neutral']!
  return pool[Math.floor(Math.random() * pool.length)]!
}

// ─── Pipeline de IA ───────────────────────────────────────────────────────────
async function handleAIResponse(
  ctx:  BotContext,
  sock: WASocket,
  msg:  WAMessage,
): Promise<boolean> {
  try {
    // 1. Intención rápida (Rust → Python)
    const nlp    = await analyzeIntent(ctx.text)
    const intent = nlp?.primary ?? 'neutral'
    if (intent === 'spam' || intent === 'nsfw') return false

    // 2. Hepein: GPT / Gemini / Claude con perfil aprendido del grupo
    const hepeinRes = await Promise.race([
      hepein.respond({
        prompt:    ctx.text,
        groupJid:  ctx.isGroup ? ctx.jid : '',
        senderJid: ctx.sender,
        intent,
        force:     true,   // omitir cooldown interno — ya lo controla handler
      }),
      new Promise<null>(r => setTimeout(() => r(null), 8_000)),
    ]).catch(() => null)

    let reply: string | null = hepeinRes?.ok ? hepeinRes.text ?? null : null

    // 3. Fallback: plantilla local si la IA no respondió
    if (!reply) {
      // Intentar con el motor de personalidad local (tiene en cuenta el modo del grupo)
      const localRes = await pythonPost<string>(
        '/api/v1/ai/personality/respond',
        {
          intent,
          text:       ctx.text,
          jid:        ctx.jid,
          use_humor:  true,
          history:    [],
          user_style: null,
        },
      ).catch(() => null)

      reply = (typeof localRes?.data === 'string' && localRes.data.trim())
        ? localRes.data.trim()
        : localFallback(intent)
    }

    await safeSend(() => sock.sendMessage(ctx.jid, { text: reply! }, { quoted: msg }))

    // 4. Guardar conversación (fire-and-forget)
    learnConversation({
      sender: ctx.sender,
      gjid:   ctx.isGroup ? ctx.jid : '',
      text:   ctx.text,
      intent,
      reply:  reply!,
      mode:   'amable',
    }).catch(() => {})

    return true
  } catch (err) {
    logger.warn({ err }, 'handleAIResponse error')
    return false
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function handleMessage(msg: WAMessage, sock: WASocket): Promise<void> {
  // Semáforo — si hay demasiados mensajes procesándose en paralelo, esperar un
  // cupo corto (absorbe picos de un par de segundos) antes de descartar.
  // Rust ya tiene rate limiting — si seguimos llenos tras la espera es
  // sobrecarga sostenida, no un pico, y ahí sí se descarta.
  if (_activeHandlers >= MAX_CONCURRENT) {
    const waitDeadline = Date.now() + MAX_QUEUE_WAIT_MS
    while (_activeHandlers >= MAX_CONCURRENT && Date.now() < waitDeadline) {
      await new Promise(r => setTimeout(r, 100))
    }
    if (_activeHandlers >= MAX_CONCURRENT) {
      logger.warn({ id: msg.key.id, active: _activeHandlers }, 'handleMessage DROPPED — semáforo lleno tras esperar')
      return
    }
  }
  _activeHandlers++

  const _startedAt = Date.now()
  logger.info({ id: msg.key.id, active: _activeHandlers }, 'handleMessage START')

  // Techo duro por mensaje — sin esto, una llamada externa lenta (Python con
  // reintentos/backoff puede tardar 20-30s en fallar) deja el slot del
  // semáforo ocupado todo ese tiempo. Si se acumulan 25 mensajes así, el bot
  // empieza a descartar TODO en silencio hasta que algo libere espacio.
  // El timeout no cancela la llamada de fondo (sigue corriendo y su resultado
  // se descarta), solo garantiza que el semáforo se libere a tiempo.
  const HANDLER_TIMEOUT_MS = 20_000
  let timedOut = false

  try {
    await Promise.race([
      (async () => {
    const jidEarly = msg.key.remoteJid ?? ''
    const textEarly = (
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      msg.message?.imageMessage?.caption ??
      msg.message?.videoMessage?.caption ??
      ''
    ).trim()

    const isGroupEarly  = jidEarly.endsWith('@g.us')
    const chatLabel     = isGroupEarly ? color.magenta('Grupo') : themes.warning('Privado')
    const meLabel       = msg.key.fromMe ? color.dim('fromMe') : color.cyan('entrante')
    const textLabel     = textEarly ? `"${textEarly.slice(0, 50)}"` : color.dim('(sin texto)')
    console.log(`  ${themes.success('◈')} ${color.bold('Handler')}  ${chatLabel} ${color.dim(jidEarly.replace('@g.us','').replace('@s.whatsapp.net',''))}  ${meLabel}  ${textLabel}`)

    if (msg.key.fromMe) return

    const base = buildBaseContext(msg, sock)
    if (!base.jid || base.jid === 'status@broadcast') return

    if (KNOWN_BOTS.has(base.sender)) return

    // ─── Rate limit por Rust (< 1ms, siempre disponible, sin Python) ─────────
    // Owners y admins no se limitan aquí — el check es solo para usuarios normales.
    // Falla abierto: si Rust no responde, el mensaje pasa igual.
    if (!base.isOwner && base.text) {
      const rate = await sessionClient.checkRate(base.sender).catch(() => ({ allowed: true, remaining: 15 }))
      if (!rate.allowed) {
        console.log(`  ${themes.error('◈')} ${color.bold(themes.error('Rate'))}  ${color.dim(base.sender.replace('@s.whatsapp.net','').replace('@lid',''))}  ${color.dim('bloqueado por Rust')}`)
        return
      }
    }

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
      console.log(`  ${themes.error('◈')} ${color.bold(themes.error('Bloqueado'))}  ${color.dim(base.sender.replace('@s.whatsapp.net','').replace('@lid',''))}  ${color.dim('fast.allowed=false')}`)
      return
    }

    const passed = await applyMiddlewares(ctx)
    if (!passed) return

    // ─── Captcha de bienvenida ────────────────────────────────────────────────
    if (ctx.isGroup && ctx.text && hasPendingCaptcha(ctx.jid, ctx.sender)) {
      await verifyCaptchaAnswer(sock, ctx.jid, ctx.sender, ctx.text)
      return
    }

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

    // ─── AFK check ────────────────────────────────────────────────────────────
    if (user.profile.afk > -1) {
      const reason = user.profile.afkReason
      user.profile.afk       = -1
      user.profile.afkReason = ''
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text:     `ⴰ️ @${ctx.sender.split('@')[0]} ya no está AFK${reason ? `\n§ Estaba: _${reason}_` : ''}`,
        mentions: [ctx.sender],
      })).catch(() => {})
    }

    // Notificar si se menciona/cita a alguien AFK
    {
      const ctxInfo  = msg.message?.extendedTextMessage?.contextInfo
      const jids     = [...new Set([
        ...(ctxInfo?.mentionedJid ?? []),
        ...(ctxInfo?.participant  ? [ctxInfo.participant] : []),
      ])]
      for (const j of jids) {
        if (j === ctx.sender) continue
        const target = getUserData(j, '')
        if (target.profile.afk > -1) {
          const elapsed = Math.floor((Date.now() - target.profile.afk) / 60_000)
          await safeSend(() => sock.sendMessage(ctx.jid, {
            text:     `ⴰ️ @${j.split('@')[0]} está AFK${target.profile.afkReason ? `\n§ Razón: _${target.profile.afkReason}_` : ''}\n§ Hace: ${elapsed} min`,
            mentions: [j],
          })).catch(() => {})
        }
      }
    }

    // ─── Anti-spam de flood ───────────────────────────────────────────────────
    if (ctx.isGroup && !ctx.isOwner && !ctx.isAdmin) {
      const isSpam = checkSpam(ctx.sender, ctx.jid)
      if (isSpam) {
        await handleSpam(sock, ctx.jid, ctx.sender, msg.key, ctx.text, ctx.isAdmin, ctx.isBotAdmin)
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
      if (ctx.text) {
        // ── Draw & Guess: intercept guesses in active group games ─────────────
        if (ctx.isGroup) {
          const dgConsumed = await handleDrawGuessMessage(sock, ctx.jid, ctx.sender, ctx.text)
          if (dgConsumed) return
        }

        // ── Quiz: intercept numeric answers for active sessions ───────────────
        if (/^[1-4]$/.test(ctx.text.trim())) {
          const qConsumed = await handleQuizMessage(sock, ctx.jid, ctx.sender, ctx.text.trim(), ctx.pushName)
          if (qConsumed) return
        }

        const botName = sock.user?.name ?? 'hepein'
        const lower   = ctx.text.toLowerCase().trim()
        const words   = lower.split(/\s+/)

        // Mencionar "hepein" o el nombre del bot siempre activa la IA (directo)
        const isDirect = words.includes('hepein') || lower.includes(botName.toLowerCase())

        if (ctx.isGroup) {
          const groupCfg = getGroupConfig(ctx.jid)
          // directo → siempre; otros triggers → solo si groupCfg.hepein está activo
          const triggered = isDirect || (groupCfg.hepein && isAITrigger(ctx.text, botName))
          if (triggered) await handleAIResponse(ctx, sock, msg)
        } else {
          if (isAITrigger(ctx.text, botName)) await handleAIResponse(ctx, sock, msg)
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
    // IMPORTANTE: leer DESPUÉS de que el comando ejecutó para no pisar cambios
    // que el propio comando hizo en money/exp/diamonds.
    const xpGain  = command.exp ?? 10
    const postUser = getUserData(ctx.sender)
    const postPatch: Partial<import('./events/index.js').UserData> = {
      exp: postUser.exp + xpGain,
    }
    if (command.limit) postPatch.diamonds = postUser.diamonds - command.limit
    if (command.money) postPatch.money    = postUser.money    - command.money
    setUserData(ctx.sender, postPatch)

    // ─── Anuncio de subida de nivel ────────────────────────────────────────────
    // Centralizado aquí (no en cada comando) porque el xpGain de arriba puede
    // por sí solo cruzar el umbral de nivel, incluso si el propio comando ya
    // chequeó subida de nivel con su exp particular.
    const leveledUp = checkLevelUp(ctx.sender)
    if (leveledUp > 0) {
      const groupCfg = ctx.isGroup ? getGroupConfig(ctx.jid) : null
      if (groupCfg === null || groupCfg.autolevelup) {
        const newLevel = getUserData(ctx.sender).level
        const name      = ctx.pushName || ctx.sender.split('@')[0]
        await safeSend(() => sock.sendMessage(ctx.jid, {
          text: `🎉 ¡*${name}* subió ${leveledUp > 1 ? `${leveledUp} niveles` : 'de nivel'} y ahora es nivel *${newLevel}*!`,
          mentions: [ctx.sender],
        })).catch(() => {})
      }
    }
      })(),
      new Promise<void>((resolve) =>
        setTimeout(() => { timedOut = true; resolve() }, HANDLER_TIMEOUT_MS)),
    ])

    if (timedOut) {
      logger.warn(
        { jid: msg.key.remoteJid },
        `handleMessage excedió ${HANDLER_TIMEOUT_MS / 1000}s — abandonado para liberar el semáforo`
      )
    }
  } catch (err: any) {
    const msg_ = err?.message ?? ''
    if (msg_.includes('Connection Closed') || msg_.includes('Connection Lost')) {
      logger.warn({ msg: msg_ }, 'Conexion caida durante mensaje — Baileys reconectara')
      return
    }
    logger.error({ err }, 'Error en handleMessage')
  } finally {
    _activeHandlers--
    logger.info(
      { id: msg.key.id, active: _activeHandlers, ms: Date.now() - _startedAt, timedOut },
      'handleMessage END'
    )
  }
}

// Para exponer el estado del semáforo en el heartbeat (src/index.ts) — así se
// ve en el mismo log que ya se vigila si el semáforo se está llenando.
export function getActiveHandlerCount(): number {
  return _activeHandlers
}