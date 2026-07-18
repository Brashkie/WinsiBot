import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { commandRegistry } from '@plugins/commands/index.js'
import { applyMiddlewares } from '@plugins/middlewares/index.js'
import { config } from '@config'
import { logger } from './logger.js'
import { color, themes } from 'ansimax'
import type { BotContext } from '../types/index.js'
import { handleNotFound } from '@plugins/commands/general/notfound.js'
import { pythonGet, pythonPost, fastProcess, analyzeIntent, learnConversation, getAIContext } from '@lib/pythonBridge.js'
import { hepein } from '@lib/hepein.js'
import { safeSend } from '@lib/media_sender.js'
import {
  addXP,
  checkSpam,
  handleSpam,
  handleAntilink,
  handleAntitoxic,
  handleAntitraba,
  getGroupConfig,
  getUserData,
  setUserData,
  checkLevelUp,
} from '@core/events.js'
import { hasPendingCaptcha, verifyCaptchaAnswer } from '@core/events/captcha.js'
import { handleDrawGuessMessage, handleQuizMessage } from '@core/events/gameHandlers.js'
import { handleTransferConfirm } from '@plugins/commands/rpg/transfer.js'
import { sessionClient } from '@lib/session.js'
import { getGroupParticipants } from '@core/groupCache.js'
import { winsiSocket } from '@core/socket.js'

// handleAIResponse puede tardar 44s+ esperando a Ollama — tiempo de sobra
// para que una reconexión (Bad MAC, watchdog zombie, corte de red) invalide
// el `sock` capturado al recibir el mensaje. Usar el socket VIVO justo antes
// de cada intento de envío (en vez del `sock` arrastrado desde el inicio del
// handler) evita mandar por una conexión ya cerrada — confirmado en logs
// reales: reconexión a las 20:01:12, error "Connection Closed" recién a las
// 20:02:57 al intentar responder por el socket viejo, con el bot ya
// reconectado y funcionando por el nuevo en ese momento.
function liveSocket(fallback: WASocket): WASocket {
  return winsiSocket.getSocket() ?? fallback
}

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

// Cola de espera por cupo — antes esto era un `while` que sondeaba cada 100ms
// (`await new Promise(r => setTimeout(r, 100))`). Con ráfagas grandes (miles
// de mensajes casi simultáneos entre el bot principal y los sub-bots) eso
// significaba: hasta 100ms de latencia extra por mensaje aunque un cupo se
// liberara al instante, y un poll corriendo por cada mensaje en espera. Acá
// el cupo se entrega apenas se libera (mismo tick, sin sondeo) y solo se usa
// un timer por esperador para el límite de espera — mismo comportamiento
// (espera acotada, luego descarta), solo sin el retraso ni el CPU del poll.
interface SlotWaiter { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }
const _slotWaiters: SlotWaiter[] = []

function acquireSlot(): Promise<boolean> {
  if (_activeHandlers < MAX_CONCURRENT) {
    _activeHandlers++
    return Promise.resolve(true)
  }
  return new Promise<boolean>(resolve => {
    const waiter: SlotWaiter = {
      resolve,
      timer: setTimeout(() => {
        const idx = _slotWaiters.indexOf(waiter)
        if (idx !== -1) _slotWaiters.splice(idx, 1)
        resolve(false)
      }, MAX_QUEUE_WAIT_MS),
    }
    _slotWaiters.push(waiter)
  })
}

function releaseSlot(): void {
  _activeHandlers--
  const waiter = _slotWaiters.shift()
  if (waiter) {
    clearTimeout(waiter.timer)
    _activeHandlers++
    waiter.resolve(true)
  }
}

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

// WhatsApp puede identificar al remitente con un @lid (identificador opaco,
// no derivado del número real) en vez de su @s.whatsapp.net — pasa cuando
// tiene la privacidad de número activada, y cada vez más seguido por el
// rollout de LID de WhatsApp incluso en chats normales. Cuando eso pasa,
// remoteJid/participant NUNCA puede matchear contra OWNER_JID sin importar
// cómo se normalice el string — son identificadores distintos, no el mismo
// número en otro formato. Baileys sí manda el número real en paralelo vía
// senderPn/participantPn — hay que preferirlo para el check de owner.
function getOwnerCandidateId(msg: WAMessage, isGroup: boolean): string {
  return (isGroup ? msg.key.participantPn : msg.key.senderPn) ?? ''
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

  const ownerCandidate    = getOwnerCandidateId(msg, isGroup)
  const ownerCandidateNum = ownerCandidate
    .replace('@s.whatsapp.net', '')
    .replace(/[^0-9]/g, '')

  const isOwner = config.ownerJid.some(o => {
    const oNum = o.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
    return o === sender || oNum === senderNum ||
      (ownerCandidateNum !== '' && oNum === ownerCandidateNum)
  })

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
): Promise<{ isAdmin: boolean; isBotAdmin: boolean; botAliases: string[] }> {
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

    // Todos los alias posibles del bot EN ESTE GRUPO — necesario para detectar
    // "responder al mensaje del bot" en grupos con addressingMode 'lid', donde
    // contextInfo.participant de un mensaje que mandó el bot puede venir como
    // su @lid de ese grupo (un identificador totalmente distinto al número
    // real), no como sock.user?.id.
    const botAliases = [botJid, sock.user?.id, botP?.id, (botP as any)?.lid]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)

    return {
      isAdmin:    senderP?.admin === 'admin' || senderP?.admin === 'superadmin',
      isBotAdmin: botP?.admin   === 'admin' || botP?.admin   === 'superadmin',
      botAliases,
    }
  } catch {
    return { isAdmin: false, isBotAdmin: false, botAliases: [] }
  }
}

// ─── AI triggers — cada palabra dispara un modelo Ollama distinto ────────────
// 'bot' se sacó del set — es muy genérico y disparaba falsos positivos en
// conversación normal. Las 4 palabras que quedan son lo bastante específicas
// para no confundirse con texto normal del chat.
const AI_MODEL_TRIGGERS: Record<string, string> = {
  hepein:   'llama3.2:3b',
  brashkie: 'mistral',
  winsi:    'phi3',
  winsito:  'phi3',
}
const DEFAULT_AI_MODEL = AI_MODEL_TRIGGERS.hepein!

function resolveAIModel(text: string): string | null {
  const words = text.toLowerCase().trim().split(/\s+/)
  for (const word of words) {
    const model = AI_MODEL_TRIGGERS[word]
    if (model) return model
  }
  return null
}

function isAITrigger(text: string, botName: string): boolean {
  if (resolveAIModel(text) !== null) return true
  if (text.toLowerCase().includes(botName.toLowerCase())) return true
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
  ctx:   BotContext,
  sock:  WASocket,
  msg:   WAMessage,
  model: string = DEFAULT_AI_MODEL,
): Promise<boolean> {
  try {
    // 1. Intención rápida (Rust → Python)
    const nlp    = await analyzeIntent(ctx.text)
    const intent = nlp?.primary ?? 'neutral'
    if (intent === 'spam' || intent === 'nsfw') return false

    // getAIContext trae el historial reciente de este sender desde Rust
    // (rustClient, timeout de 300ms — rápido). Existía hace rato pero nunca
    // se llamaba desde ningún lado: hepein_respond() en Python SIEMPRE
    // devuelve ok:true con algún texto (real o de su propio fallback de
    // plantilla interno cuando Ollama falla), y ese fallback interno nunca
    // recibía historial — así que el filtro anti-repetición que ya existe en
    // generate_response() (evita repetir las últimas 5 respuestas) nunca se
    // activaba en la práctica. De ahí que la IA pareciera repetirse. Se pide
    // ANTES de la llamada principal (no en paralelo) porque hepein.respond()
    // necesita poder reenviárselo a Python para que su fallback interno lo use.
    const aiContext = await getAIContext(ctx.sender).catch(() => null)
    const history   = aiContext?.history ?? []

    // Placeholder inmediato — Ollama en CPU (sin GPU) puede tardar 20-35s+ en
    // responder (medido en real: ~19s para una respuesta corta con
    // llama3.2:3b). Antes no había ningún feedback durante esa espera, así
    // que además de caer casi siempre al fallback (ver nota del timeout
    // abajo), el usuario tampoco tenía forma de saber si el bot seguía "vivo".
    const thinking = await safeSend(() => liveSocket(sock).sendMessage(ctx.jid, {
      text: '🤔 Pensando...',
    }, { quoted: msg })).catch(() => null)
    const thinkingKey = thinking?.key

    // 2. Hepein: Ollama (modelo según la palabra que disparó) con perfil
    // aprendido del grupo. El timeout acá (44s) va apenas por debajo del
    // timeout HTTP de hepein.respond() (45s, ver hepein.ts) — que a su vez
    // le da margen a Ollama del lado Python (OLLAMA_TIMEOUT=40s por defecto)
    // para terminar de verdad. Antes esto cortaba a los 14s, MUCHO antes de
    // que Ollama llegara a responder en este tipo de hardware — así que
    // prácticamente SIEMPRE caía al fallback de plantillas de Python aunque
    // la IA real sí iba a contestar, solo que más lento. De ahí la queja de
    // que Hepein "no habla como una IA real, repite lo que ya existe".
    const hepeinRes = await Promise.race([
      hepein.respond({
        prompt:    ctx.text,
        groupJid:  ctx.isGroup ? ctx.jid : '',
        senderJid: ctx.sender,
        intent,
        model,
        history,
        force:     true,   // omitir cooldown interno — ya lo controla handler
      }),
      new Promise<null>(r => setTimeout(() => r(null), 44_000)),
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
          history,
          user_style: null,
        },
      ).catch(() => null)

      reply = (typeof localRes?.data === 'string' && localRes.data.trim())
        ? localRes.data.trim()
        : localFallback(intent)
    }

    // Editar el "Pensando..." con la respuesta final en vez de mandar un
    // mensaje nuevo — si por lo que sea no se pudo mandar el placeholder,
    // cae a mandar la respuesta como mensaje normal.
    if (thinkingKey) {
      await safeSend(() => liveSocket(sock).sendMessage(ctx.jid, { text: reply!, edit: thinkingKey } as any))
    } else {
      await safeSend(() => liveSocket(sock).sendMessage(ctx.jid, { text: reply! }, { quoted: msg }))
    }

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
  const acquired = await acquireSlot()
  if (!acquired) {
    logger.warn({ id: msg.key.id, active: _activeHandlers }, 'handleMessage DROPPED — semáforo lleno tras esperar')
    return
  }

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

    // fastProcess (Python/Cython) hace su propio chequeo de owner con el
    // `sender` que se le pase — si le mandamos el @lid en vez del número
    // real, su `is_owner` sale false y pisa el `base.isOwner` (correcto) de
    // abajo, porque `fast?.is_owner ?? base.isOwner` solo cae al fallback
    // cuando fast es null/undefined, no cuando es `false`. Mandarle el
    // número real (si Baileys lo dio) evita ese pisado.
    const senderForFast = getOwnerCandidateId(msg, base.isGroup) || base.sender

    // resolveGroupRoles depende de getGroupParticipants → en un cache miss
    // (TTL 5min, 400+ grupos activos) es un IQ en vivo a WhatsApp, sin límite
    // propio — y defaultQueryTimeoutMs del socket es 60s. Sin este race, un
    // solo grupo con metadata lenta podía trabar el pipeline entero de ESE
    // mensaje hasta 60s antes de que el timeout general del handler (20s)
    // recién ahí soltara el cupo del semáforo. 2s alcanza de sobra para el
    // caso normal (cache hit = síncrono) y deja el peor caso acotado; la
    // consulta real sigue en curso de fondo y llena el cache para la próxima.
    const [rolesResult, fastResult] = await Promise.allSettled([
      base.isGroup
        ? Promise.race([
            resolveGroupRoles(sock, base.jid, base.sender),
            new Promise<{ isAdmin: boolean; isBotAdmin: boolean; botAliases: string[] }>(r =>
              setTimeout(() => r({ isAdmin: false, isBotAdmin: false, botAliases: [] }), 2_000)),
          ])
        : Promise.resolve({ isAdmin: false, isBotAdmin: false, botAliases: [] }),
      Promise.race([
        fastProcess(base.text, config.prefix, senderForFast, base.jid, config.ownerJid),
        new Promise<null>(r => setTimeout(() => r(null), 500)),
      ]),
    ])

    const roles = rolesResult.status === 'fulfilled'
      ? rolesResult.value
      : { isAdmin: false, isBotAdmin: false, botAliases: [] as string[] }

    const fast = fastResult.status === 'fulfilled' ? fastResult.value : null

    // OR, no reemplazo: `base.isOwner` (TS, síncrono) y `fast.is_owner`
    // (Python/Cython, puede fallar o quedar corto por diferencias de
    // normalización) son dos intentos de detectar lo mismo. Si cualquiera
    // de los dos dice que sí, es owner — nunca dejar que uno "quite" un
    // owner que el otro sí detectó bien.
    const ctx: BotContext = {
      ...base,
      isAdmin:    roles.isAdmin,
      isBotAdmin: roles.isBotAdmin,
      isOwner:    base.isOwner || (fast?.is_owner ?? false),
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

    // ─── Entrenamiento (Hepein) — aprende de cada mensaje real del grupo ──────
    // Fire-and-forget: no bloquea el handler ni afecta la latencia del mensaje.
    // trainer.py (vocabulario/estilo) y user_memory.py (reputación) se nutren
    // acá — antes ninguno de los dos recibía datos.
    if (ctx.isGroup && ctx.text) {
      const isReply = !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      hepein.record({ groupJid: ctx.jid, senderJid: ctx.sender, text: ctx.text, isReply })

      analyzeIntent(ctx.text)
        .then(nlp => hepein.updateMemory(ctx.sender, ctx.text, nlp?.primary ?? 'neutral', !!ctx.prefix))
        .catch(() => {})
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

      // handleAntilink cubre antilink (WA), antilink2 (genérico), y las 4
      // flags de anti-plataforma (telegram/discord/tiktok/youtube) en un
      // solo chequeo — lee groupCfg internamente vía getGroupConfig(jid).
      const linkDeleted = await handleAntilink(
        sock, ctx.jid, ctx.sender, msg.key, ctx.text, ctx.isAdmin, ctx.isBotAdmin,
      )
      if (linkDeleted) return

      const toxicDeleted = await handleAntitoxic(
        sock, ctx.jid, ctx.sender, msg.key, ctx.text, ctx.isAdmin, ctx.isBotAdmin,
      )
      if (toxicDeleted) return

      const trabaDeleted = await handleAntitraba(
        sock, ctx.jid, ctx.sender, msg.key, ctx.text, ctx.isAdmin, ctx.isBotAdmin,
      )
      if (trabaDeleted) return

      if (groupCfg.antispam && ctx.text.length > 10) {
        // Timeout corto a propósito: esto corre para CADA mensaje de grupo
        // (no solo comandos) cuando antispam está activo, y ocupa un cupo del
        // semáforo mientras espera. Con el timeout default (5s) del cliente,
        // una racha de mensajes con Python lento podía llenar el semáforo con
        // solo esta llamada. Es moderación best-effort — falla abierto rápido.
        const spamResult = await pythonPost<{ is_spam: boolean; confidence: number }>(
          '/api/v1/ml/predict/spam', { text: ctx.text }, 1_500
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
        // ── Transferencia: "si"/"no" sueltos confirman una transferencia
        // pendiente de este usuario (ver comentario en transfer.ts) ───────────
        const tConsumed = await handleTransferConfirm(sock, ctx.jid, ctx.sender, ctx.text)
        if (tConsumed) return

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
        const aiModel = resolveAIModel(ctx.text) ?? DEFAULT_AI_MODEL

        // Responder (citar) un mensaje que mandó el propio bot también cuenta
        // como dirigirse a él directamente — antes solo se detectaba mencionar
        // "hepein"/el nombre del bot en el texto, así que responder a algo que
        // el bot dijo (sin repetir su nombre) no disparaba nada.
        //
        // Comparar solo contra sock.user?.id no alcanza en grupos con
        // addressingMode 'lid': ahí contextInfo.participant de un mensaje que
        // mandó el BOT puede venir como su @lid de ESE grupo — un
        // identificador totalmente distinto al número real, no derivable por
        // normalización de dígitos. roles.botAliases (resuelto contra la
        // lista real de participantes del grupo) cubre ese caso; el chequeo
        // por dígitos cubre DMs y grupos sin lid.
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant
        const botNum    = (sock.user?.id ?? '').split(':')[0]?.replace(/[^0-9]/g, '') ?? ''
        const quotedNum = (quotedParticipant ?? '').replace('@s.whatsapp.net', '').replace('@lid', '').replace(/[^0-9]/g, '')
        const isReplyToBot = !!quotedParticipant && (
          (!!botNum && quotedNum === botNum) ||
          roles.botAliases.includes(quotedParticipant)
        )

        // Mencionar "hepein" o el nombre del bot, o responderle directamente, activa la IA (directo)
        const isDirect = words.includes('hepein') || lower.includes(botName.toLowerCase()) || isReplyToBot

        if (ctx.isGroup) {
          const groupCfg = getGroupConfig(ctx.jid)
          // directo → siempre; otros triggers → solo si groupCfg.hepein está activo
          const triggered = isDirect || (groupCfg.hepein && isAITrigger(ctx.text, botName))
          if (triggered) await handleAIResponse(ctx, sock, msg, aiModel)
        } else {
          // isDirect acá cubre responder al mensaje del bot en un DM — antes
          // esta rama solo miraba isAITrigger, así que "responder al bot" no
          // hacía nada en privado, solo en grupos.
          if (isDirect || isAITrigger(ctx.text, botName)) await handleAIResponse(ctx, sock, msg, aiModel)
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
      // Último intento antes de rechazar: en grupos con addressingMode 'lid',
      // msg.key NO trae senderPn/participantPn (confirmado con log real — esos
      // campos vinieron undefined), así que el fallback de arriba no alcanza.
      // Pero el objeto Contact del participante en groupMetadata sí trae el
      // número real en `.jid` (distinto de `.id`/`.lid`, que están en formato
      // @lid cuando el grupo usa addressingMode 'lid') — se resuelve acá,
      // solo en este punto exacto (no en cada mensaje), porque implica una
      // consulta a los metadatos del grupo.
      if (ctx.isGroup && ctx.sender.endsWith('@lid')) {
        try {
          const participants = await getGroupParticipants(sock, ctx.jid)
          const p = participants.find((pp: any) => pp.lid === ctx.sender || pp.id === ctx.sender)
          const realJid = (p as any)?.jid as string | undefined
          const realNum = realJid?.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
          if (realNum) {
            ctx.isOwner = config.ownerJid.some(o =>
              o.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') === realNum
            )
          }
          // Diagnóstico temporal — sacar una vez confirmado que esto resuelve
          // el owner check en grupos con addressingMode 'lid'.
          logger.warn({
            sender: ctx.sender, foundParticipant: !!p, realJid, resolved: ctx.isOwner,
          }, 'Resolución @lid → jid real para owner check')
        } catch (err) {
          logger.warn({ err }, 'No se pudo resolver @lid del owner contra metadatos del grupo')
        }
      }
    }

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
      if (command.category === 'rpg' && !groupCfg.rpg && !ctx.isOwner) {
        await safeSend(() => sock.sendMessage(ctx.jid, {
          text: '✗ Los comandos RPG están desactivados en este grupo.',
        }, { quoted: msg }))
        return
      }
    }

    if (command.premiumOnly && !user.premium && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: '✗ Este comando es solo para usuarios *premium*.',
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
      exp:          postUser.exp + xpGain,
      commandsUsed: postUser.commandsUsed + 1,
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
    releaseSlot()
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