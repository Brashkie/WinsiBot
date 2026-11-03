import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { commandRegistry } from '@plugins/commands/index.js'
import { applyMiddlewares } from '@plugins/middlewares/index.js'
import { config } from '@config'
import { logger } from './logger.js'
import { registerSemaphore, shouldShed, priorityOf, loadLevel } from './loadShedding.js'
import { color, themes } from 'ansimax'
import { anchoTerminal, anchoTexto, cortar } from '@lib/terminal.js'
import type { BotContext } from '../types/index.js'
import { handleNotFound } from '@plugins/commands/general/notfound.js'
import { analyzeIntent, learnConversation, getAIContext, ingerirMensaje } from '@lib/nativeBridge.js'
import { hepein } from '@lib/hepein.js'
import { safeSend } from '@lib/media_sender.js'
import {
  addXP,
  checkSpam,
  handleSpam,
  isContentSpam,
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
import { getGroupParticipants } from '@core/groupCache.js'
import { winsiSocket } from '@core/socket.js'
import { getNumber } from '@lib/jid_utils.js'
import { esDueno, esLaCuentaDelBot } from '@lib/owner.js'
import { nombraAlBot } from '@lib/aiTrigger.js'
import { AvisoAlUsuario } from '@lib/userNotice.js'
import { LimitePorRemitente } from '@lib/senderRate.js'
import { acreditar, cambiarSaldos } from '@core/economy.js'

import { numeroDe } from '@lib/members.js'
import { idiomaDe, t } from '@lib/i18n.js'

const limitePorRemitente = new LimitePorRemitente()

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

// El load shedding usa la ocupación del semáforo como una de sus dos señales
// (la otra es el lag del event loop). Se inyecta en vez de importarse desde
// allá para no crear un ciclo entre handler.ts y loadShedding.ts.
registerSemaphore(() => ({
  active:  _activeHandlers,
  max:     MAX_CONCURRENT,
  waiting: _slotWaiters.length,
}))

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
/** Quién es el remitente en el grupo; `senderPn`, su teléfono si el grupo lo da. */
type Roles = { isAdmin: boolean; isBotAdmin: boolean; botAliases: string[]; senderPn?: string }

/**
 * Si avisar que `quien` está AFK en el grupo `gjid`. No en su primer minuto
 * AFK —acaba de escribir—: otro bot que contestaba citando su `#afk` hacía
 * salir "está AFK · Hace: 0 min" pegado al "AFK activado". Y una vez cada 5
 * minutos por persona y grupo: una ráfaga de respuestas no llena el chat.
 */
const ultimoAvisoAfk = new Map<string, number>()
function avisarAfk(gjid: string, quien: string, desde: number): boolean {
  const ahora = Date.now()
  if (ahora - desde < 60_000) return false
  const clave = `${gjid}|${quien}`
  if (ahora - (ultimoAvisoAfk.get(clave) ?? 0) < 5 * 60_000) return false
  if (ultimoAvisoAfk.size > 2_000) ultimoAvisoAfk.clear()
  ultimoAvisoAfk.set(clave, ahora)
  return true
}

function getOwnerCandidateId(msg: WAMessage, isGroup: boolean): string {
  return (isGroup ? msg.key.participantPn : msg.key.senderPn) ?? ''
}

// ─── Construir contexto base ──────────────────────────────────────────────────
function buildBaseContext(
  msg:  WAMessage,
  sock: WASocket,
): Omit<BotContext, 'isAdmin' | 'isBotAdmin' | 'lang'> {
  const jid     = msg.key.remoteJid ?? ''
  const isGroup = jid.endsWith('@g.us')
  const sender  = isGroup
    ? (msg.key.participant ?? '')
    : (msg.key.remoteJid  ?? '')
  const text    = extractText(msg).trim()

  // Solo contra teléfonos, nunca los dígitos de un @lid (ver lib/owner.ts);
  // y la propia cuenta del bot, escribiendo desde su teléfono, también.
  const isOwner = esDueno(sender, getOwnerCandidateId(msg, isGroup), config.ownerJid) ||
    esLaCuentaDelBot(sender, sock.user?.id ?? '', (sock.user as { lid?: string } | undefined)?.lid ?? '')

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

/**
 * `ctx.lang` se calcula la primera vez que alguien lo lee, y queda guardado.
 * Casi ningún mensaje lo necesita —la mayoría no es un comando y no recibe
 * respuesta—, y deducirlo (usuario, número, país, grupo) cuesta ~380 ns: en
 * un grupo activo, millones de veces al día para nada.
 *
 * Se define sobre el ctx ya armado y no en buildBaseContext: un `...base`
 * llama al getter al copiar y lo volvería a hacer de entrada.
 */
function conIdiomaPerezoso(ctx: Omit<BotContext, 'lang'>, msg: WAMessage): BotContext {
  return Object.defineProperty(ctx, 'lang', {
    configurable: true,
    enumerable:   true,
    get(this: BotContext) {
      const lang = idiomaDe({
        elegido: this.sender ? getUserData(this.sender).idioma : undefined,
        numero:  numeroDe(this.sender, msg, this.isGroup),
        grupo:   this.isGroup ? getGroupConfig(this.jid).idioma : undefined,
      })
      Object.defineProperty(this, 'lang', { value: lang, writable: true, enumerable: true, configurable: true })
      return lang
    },
  }) as BotContext
}

// ─── Resolver roles del grupo con cache ───────────────────────────────────────
async function resolveGroupRoles(
  sock:   WASocket,
  jid:    string,
  sender: string,
): Promise<Roles> {
  try {
    const participants = await getGroupParticipants(sock, jid)

    const senderP = participants.find((p: any) =>
      p.id === sender || (p as any).lid === sender
    )
    const botJid = `${(sock.user?.id ?? '').split(':')[0]}@s.whatsapp.net`
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

    // El teléfono del remitente, si el grupo lo da: en grupos con @lid es lo
    // único que dice quién es el dueño cuando el mensaje no trae
    // participantPn (ver lib/owner.ts). Lo pone el servidor de WhatsApp en la
    // lista de participantes (`phone_number`), no quien manda el mensaje.
    const tel = senderP?.jid
    return {
      isAdmin:    senderP?.admin === 'admin' || senderP?.admin === 'superadmin',
      isBotAdmin: botP?.admin   === 'admin' || botP?.admin   === 'superadmin',
      botAliases,
      ...(tel?.endsWith('@s.whatsapp.net') ? { senderPn: tel } : {}),
    }
  } catch {
    return { isAdmin: false, isBotAdmin: false, botAliases: [] }
  }
}

// ─── AI triggers ──────────────────────────────────────────────────────────────
// Las palabras que hacen hablar a la IA. 'bot' se sacó del set — es muy
// genérico y disparaba falsos positivos en conversación normal.
//
// "hepein" usa el modelo del .env (OLLAMA_MODEL). Hasta la 8.18.0 pedía
// `llama3.2:3b` por nombre, siempre: con cualquier otro modelo —el de
// Cosxamix, u otro de Ollama— la Session API no lo encontraba, no probaba
// nada más y contestaba con una plantilla. Las otras palabras piden un modelo
// concreto de Ollama; si no está instalado, se usa el del .env.
const AI_TRIGGER_WORDS = new Set(['hepein', 'brashkie', 'winsi', 'winsito'])
const AI_MODEL_BY_WORD: Record<string, string> = {
  brashkie: 'mistral',
  winsi:    'phi3',
  winsito:  'phi3',
}

/** El modelo que pide una palabra del mensaje, o undefined para el del .env. */
function resolveAIModel(text: string): string | undefined {
  for (const word of text.toLowerCase().trim().split(/\s+/)) {
    const model = AI_MODEL_BY_WORD[word]
    if (model) return model
  }
  return undefined
}

function isAITrigger(text: string, botName: string): boolean {
  if (text.toLowerCase().trim().split(/\s+/).some(w => AI_TRIGGER_WORDS.has(w))) return true
  // Como palabra suelta y no "en cualquier parte" (ver lib/aiTrigger.ts).
  return nombraAlBot(text, [botName])
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
  const pool = FALLBACK_RESPONSES[intent] ?? FALLBACK_RESPONSES.neutral!
  return pool[Math.floor(Math.random() * pool.length)]!
}

// ─── Pipeline de IA ───────────────────────────────────────────────────────────
async function handleAIResponse(
  ctx:   BotContext,
  sock:  WASocket,
  msg:   WAMessage,
  model?: string,
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

    // Si pregunta cómo hacer algo con el bot, los comandos que sirven, del
    // registro real (ver lib/commandHelp.ts). En una charla normal no se busca.
    const { ayudaDeComandos } = await import('@lib/commandHelp.js')
    const comandos = await ayudaDeComandos(
      ctx.text, ctx.lang, config.prefix[0] ?? '#',
      () => new Set(commandRegistry.values()),
    ).catch(() => '')

    // Placeholder inmediato — Ollama en CPU (sin GPU) puede tardar 20-35s+ en
    // responder (medido en real: ~19s para una respuesta corta con
    // llama3.2:3b). Antes no había ningún feedback durante esa espera, así
    // que además de caer casi siempre al fallback (ver nota del timeout
    // abajo), el usuario tampoco tenía forma de saber si el bot seguía "vivo".
    await safeSend(() => liveSocket(sock).sendMessage(ctx.jid, {
      text: '🤔 Pensando...',
    }, { quoted: msg })).catch(() => null)

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
        // Sin palabra que pida otro, nada: la Session API usa OLLAMA_MODEL.
        ...(model ? { model } : {}),
        history,
        ...(comandos ? { comandos } : {}),
        force:     true,   // omitir cooldown interno — ya lo controla handler
      }),
      new Promise<null>(r => setTimeout(() => r(null), 44_000)),
    ]).catch(() => null)

    let reply: string | null = hepeinRes?.ok ? hepeinRes.text ?? null : null

    // Que se vea cuando no contestó la IA: si no, solo se nota en respuestas
    // de plantilla ("mm", "Y...") sin saber si fue Rust o el modelo.
    if (!hepeinRes) {
      logger.warn({ jid: ctx.jid }, 'IA: Rust no contestó en 44 s — plantilla local')
    } else if (!hepeinRes.ok) {
      logger.warn({ jid: ctx.jid, error: hepeinRes.error }, 'IA: sin respuesta de Rust — plantilla local')
    } else if (hepeinRes.source === 'plantilla') {
      logger.warn({ jid: ctx.jid }, 'IA: ningún modelo contestó (¿Cosxamix ocupado o caído?) — plantilla de Rust')
    }

    // 3. Último recurso, si Rust no respondió en absoluto.
    //
    // Acá había un segundo viaje a `/api/v1/ai/personality/respond` de Python
    // para pedirle una plantilla cuando la IA no contestaba. Ya no hace falta:
    // `/ai/chat/respond` de Rust prueba Ollama y las APIs cloud y, si ninguna
    // responde, cae por su cuenta al motor local de plantillas — con el modo
    // del grupo y el historial para no repetirse. Lo único que queda acá es la
    // red de seguridad para cuando Rust entero está caído.
    if (!reply) {
      reply = localFallback(intent)
    }

    // La respuesta, en un mensaje propio que cita al del usuario. Hasta la 9.2
    // editaba el "Pensando...", y en el chat se veía el texto cambiando.
    await safeSend(() => liveSocket(sock).sendMessage(ctx.jid, { text: reply! }, { quoted: msg }))

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
  // En debug: era info, y con END eran dos líneas de log por mensaje.
  logger.debug({ id: msg.key.id, active: _activeHandlers }, 'handleMessage START')

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
    const chat          = isGroupEarly ? 'Grupo' : 'Privado'
    const yo            = msg.key.fromMe ? 'fromMe' : 'entrante'
    const id            = jidEarly.replace('@g.us', '').replace('@s.whatsapp.net', '')
    // Un renglón por mensaje: en Termux vertical (40-50 columnas) se partía en
    // dos o tres. Se corta solo el texto, que es lo que varía, con lo que deja
    // libre el resto (ver lib/terminal.ts: truncateAnsi costaba ~290 µs).
    const fijo          = anchoTexto(`  ◈ Handler  ${chat} ${id}  ${yo}  ""`)
    const textLabel     = textEarly ? `"${cortar(textEarly, Math.min(50, anchoTerminal() - fijo))}"` : color.dim('(sin texto)')
    // stdout.write y no console.log: la misma línea, sin el formateo de console
    // (~1,5 contra ~4 µs por mensaje, medido con la salida a NUL).
    process.stdout.write(`  ${themes.success('◈')} ${color.bold('Handler')}  ${isGroupEarly ? color.magenta(chat) : themes.warning(chat)} ${color.dim(id)}  ${msg.key.fromMe ? color.dim(yo) : color.cyan(yo)}  ${textLabel}
`)

    if (msg.key.fromMe) return

    const base = buildBaseContext(msg, sock)
    if (!base.jid || base.jid === 'status@broadcast') return

    if (KNOWN_BOTS.has(base.sender)) return

    // ─── Rate limit: 15 por remitente cada 10 s, en memoria ──────────────────
    // Owners no se limitan. Hasta la 9.2 era un viaje a Rust que se esperaba en
    // cada mensaje: ~157 µs y ~150 µs de CPU de Node para sumar uno a un
    // contador (ver lib/senderRate.ts). Misma regla, menos de 1 µs.
    if (!base.isOwner && base.text && !limitePorRemitente.permitir(base.sender)) {
      console.log(`  ${themes.error('◈')} ${color.bold(themes.error('Rate'))}  ${color.dim(base.sender.replace('@s.whatsapp.net','').replace('@lid',''))}  ${color.dim('15 mensajes en 10 s')}`)
      return
    }

    // resolveGroupRoles depende de getGroupParticipants → en un cache miss
    // (TTL 5min, 400+ grupos activos) es un IQ en vivo a WhatsApp, sin límite
    // propio — y defaultQueryTimeoutMs del socket es 60s. Sin este race, un
    // solo grupo con metadata lenta podía trabar el pipeline entero de ESE
    // mensaje hasta 60s antes de que el timeout general del handler (20s)
    // recién ahí soltara el cupo del semáforo. 2s alcanza de sobra para el
    // caso normal (cache hit = síncrono) y deja el peor caso acotado; la
    // consulta real sigue en curso de fondo y llena el cache para la próxima.
    const rolesResult = await Promise.allSettled([
      base.isGroup
        ? Promise.race([
            resolveGroupRoles(sock, base.jid, base.sender),
            new Promise<Roles>(r =>
              setTimeout(() => r({ isAdmin: false, isBotAdmin: false, botAliases: [] }), 2_000)),
          ])
        : Promise.resolve<Roles>({ isAdmin: false, isBotAdmin: false, botAliases: [] }),
    ]).then(([r]) => r)

    const roles: Roles = rolesResult.status === 'fulfilled'
      ? rolesResult.value
      : { isAdmin: false, isBotAdmin: false, botAliases: [] as string[] }

    // Antes acá corría también fastProcess() (Python/Cython), que devolvía
    // `is_owner` y `allowed`. Los dos eran redundantes:
    //
    //  · `is_owner` — buildBase() ya lo calcula síncrono y con MÁS cobertura:
    //    misma normalización, más `ownerCandidateNum` (el número real que
    //    Baileys expone cuando el grupo usa @lid). De hecho a fastProcess se
    //    le pasaba ese número ya resuelto por TS para que llegara al mismo
    //    resultado, y después se hacía OR con el propio — circular.
    //  · `allowed` — un tercer rate limit, después del de Rust (checkRate,
    //    unas líneas más arriba) y el local del middleware.
    //
    // A cambio costaba un round-trip HTTP a Python en CADA mensaje (no solo
    // comandos) con hasta 500ms de espera en el camino crítico, y ya había
    // causado un bug real pisando el isOwner correcto.
    // En un grupo con @lid, si el mensaje no trajo el teléfono del
    // remitente, el de la lista de participantes. Sin esto el dueño no era
    // dueño en esos grupos: el log decía "Owner ✗ No" (9.3.0).
    const isOwner = base.isOwner ||
      (!!roles.senderPn && esDueno(base.sender, roles.senderPn, config.ownerJid))
    const ctx = conIdiomaPerezoso({
      ...base,
      isOwner,
      isAdmin:    roles.isAdmin,
      isBotAdmin: roles.isBotAdmin,
    }, msg)

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
        text: t(ctx.lang, 'err.baneado', { motivo: user.banReason || t(ctx.lang, 'err.sinMotivo') }),
      }, { quoted: msg }))
      return
    }

    if (ctx.sender) {
      addXP(ctx.sender, ctx.pushName)
    }

    // ─── Entrenamiento (Hepein) — aprende de cada mensaje real del grupo ──────
    // Fire-and-forget: no bloquea el handler ni afecta la latencia del mensaje.
    //
    // Va a Rust en UN viaje (POST /msg/ingest, ver ingerirMensaje): clasificar
    // el texto, guardarlo en la tabla `conversations` —la misma que llena
    // learnConversation() en handleAIResponse— y actualizar la memoria del
    // remitente. Eran tres viajes por mensaje de grupo. La clasificación queda
    // en caché para el antitóxico y el anti-spam de más abajo.
    //
    // Los textos de menos de 3 caracteres no se guardan para el estilo (como
    // hacía hepein.record), pero sí cuentan para la memoria.
    if (ctx.isGroup && ctx.text) {
      ingerirMensaje({
        sender: ctx.sender, gjid: ctx.jid, text: ctx.text,
        isCmd: !!ctx.prefix, observar: ctx.text.trim().length >= 3,
      })
    }

    // ─── AFK check ────────────────────────────────────────────────────────────
    if (user.profile.afk > -1) {
      const reason = user.profile.afkReason
      const menciones = user.profile.afkMenciones ?? []
      user.profile.afk       = -1
      user.profile.afkReason = ''
      delete user.profile.afkMenciones
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text:     `ⴰ️ @${ctx.sender.split('@')[0]} ya no está AFK${reason ? `\n§ Estaba: _${reason}_` : ''}`,
        mentions: [ctx.sender, ...menciones],
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
        if (target.profile.afk > -1 && avisarAfk(ctx.jid, j, target.profile.afk)) {
          const elapsed = Math.floor((Date.now() - target.profile.afk) / 60_000)
          await safeSend(() => sock.sendMessage(ctx.jid, {
            text:     `ⴰ️ @${j.split('@')[0]} está AFK${target.profile.afkReason ? `\n§ Razón: _${target.profile.afkReason}_` : ''}\n§ Hace: ${elapsed} min`,
            mentions: [j, ...(target.profile.afkMenciones ?? [])],
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
        // Antes esto llamaba a `/api/v1/ml/predict/spam` de Python, que no era
        // un clasificador de contenido: envolvía la librería C spam_guard.c,
        // un rate limiter por remitente, pasándole el sender FIJO
        // `'__predict__'`. Con los valores por defecto —8 mensajes en una
        // ventana de 5 s— eso significaba que TODOS los usuarios de TODOS los
        // grupos compartían un solo contador: pasados 8 mensajes en cualquier
        // ventana de 5 segundos, el siguiente mensaje volvía con
        // `allowed: false`, que el router traducía a confianza 0.9, y acá se
        // borraba y se acusaba públicamente a quien lo había escrito. En un
        // grupo activo, 8 mensajes en 5 segundos es cualquier conversación
        // normal.
        //
        // Ahora lo resuelve Rust (`/nlp/fast`), que sí mira el contenido:
        // caracteres repetidos, patrones cortos repetidos y texto basura.
        if (await isContentSpam(ctx.text)) {
          const num = getNumber(ctx.sender)
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
        const aiModel = resolveAIModel(ctx.text)

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
        const quotedNum = getNumber(quotedParticipant ?? '')
        const isReplyToBot = !!quotedParticipant && (
          (!!botNum && quotedNum === botNum) ||
          roles.botAliases.includes(quotedParticipant)
        )

        // Mencionar "hepein" o el nombre del bot, o responderle directamente, activa la IA (directo)
        // El nombre como palabra suelta: "El comando *hepein* no existe", de
        // otro bot del grupo, ya no dispara la IA (ver lib/aiTrigger.ts).
        const isDirect = nombraAlBot(ctx.text, ['hepein', botName]) || isReplyToBot

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
    // Los alias ya son claves del registro (ver plugins/commands/index.ts): un
    // solo get. Había además un recorrido de todos los comandos buscando el
    // alias, que nunca podía encontrar lo que el Map no tuviera, y copiaba
    // ~400 entradas en cada comando mal escrito.
    const command = commandRegistry.get(ctx.command)

    if (!command) {
      await handleNotFound(ctx)
      return
    }

    // ─── Load shedding ────────────────────────────────────────────────────────
    // Con el bot saturado, sacrificar lo prescindible antes que morir con todo
    // dentro. No se responde nada a propósito: generar más mensajes salientes
    // justo cuando estamos ahogados empeora la carga y el riesgo de que
    // WhatsApp lea el patrón como abuso. Moderación, admin y owner nunca caen.
    // Ver core/loadShedding.ts.
    if (shouldShed(priorityOf(command.category))) {
      logger.warn(
        { command: ctx.command, category: command.category, level: loadLevel() },
        'comando descartado por carga',
      )
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
        text: t(ctx.lang, 'err.owner'),
      }, { quoted: msg }))
      return
    }

    if (command.groupOnly && !ctx.isGroup) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: t(ctx.lang, 'err.grupo'),
      }, { quoted: msg }))
      return
    }

    if (command.adminOnly && !ctx.isAdmin && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: t(ctx.lang, 'err.admin'),
      }, { quoted: msg }))
      return
    }

    if (ctx.isGroup) {
      const groupCfg = getGroupConfig(ctx.jid)
      if (groupCfg.modoadmin && !ctx.isAdmin && !ctx.isOwner) return
      if (command.category === 'rpg' && !groupCfg.rpg && !ctx.isOwner) {
        await safeSend(() => sock.sendMessage(ctx.jid, {
          text: t(ctx.lang, 'err.rpgOff'),
        }, { quoted: msg }))
        return
      }
    }

    if (command.premiumOnly && !user.premium && !ctx.isOwner) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: t(ctx.lang, 'err.premium'),
      }, { quoted: msg }))
      return
    }

    if (command.level && user.level < command.level) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: t(ctx.lang, 'err.nivel', { nivel: command.level, tuyo: user.level }),
      }, { quoted: msg }))
      return
    }

    if (command.limit && !user.premium && !ctx.isOwner && user.diamonds < command.limit) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: t(ctx.lang, 'err.diamantes', { costo: command.limit, tienes: user.diamonds }),
      }, { quoted: msg }))
      return
    }

    if (command.money && !user.premium && !ctx.isOwner && user.money < command.money) {
      await safeSend(() => sock.sendMessage(ctx.jid, {
        text: t(ctx.lang, 'err.monedas', { costo: command.money, tienes: user.money }),
      }, { quoted: msg }))
      return
    }

    // ─── Ejecutar comando ─────────────────────────────────────────────────────
    logger.info({ cmd: ctx.command, sender: ctx.sender, jid: ctx.jid }, 'Comando ejecutado')
    try {
      await command.execute(ctx)
    } catch (err) {
      // Un fallo con arreglo (falta un programa, un servicio no responde): se le
      // dice al usuario, y al log una línea con qué hacer, no una traza.
      if (!(err instanceof AvisoAlUsuario)) throw err
      logger.warn({ cmd: ctx.command }, err.message)
      await safeSend(() => sock.sendMessage(ctx.jid, { text: err.paraElUsuario }, { quoted: msg })).catch(() => {})
      return
    }

    // ─── Post-ejecucion ───────────────────────────────────────────────────────
    // IMPORTANTE: leer DESPUÉS de que el comando ejecutó para no pisar cambios
    // que el propio comando hizo en money/exp/diamonds.
    const xpGain  = command.exp ?? 10
    const postUser = getUserData(ctx.sender)
    setUserData(ctx.sender, { commandsUsed: postUser.commandsUsed + 1 })

    // La XP del comando y su costo, en una operación de Ada/SPARK (ver
    // core/economy.ts). El costo, solo a quien lo paga: el chequeo de arriba
    // exime a premium y owner, pero hasta la 9.2 el cobro de acá les cobraba
    // igual, y un premium sin diamantes quedaba en negativo.
    const paga = !postUser.premium && !ctx.isOwner
    const cuenta = (campo: 'exp' | 'diamonds' | 'money', delta: number) => ({ cuenta: { jid: ctx.sender, campo }, delta })
    const cobro = await cambiarSaldos([
      cuenta('exp', xpGain),
      ...(paga && command.limit ? [cuenta('diamonds', -command.limit)] : []),
      ...(paga && command.money ? [cuenta('money', -command.money)] : []),
    ])
    if (!cobro.ok) {
      // Gastó lo que tenía durante el comando, o la Session API no respondió:
      // la XP se acredita igual (o queda anotada) y el costo no cobrado se dice.
      await acreditar(ctx.sender, { exp: xpGain })
      if (paga && (command.limit || command.money)) {
        logger.warn({ cmd: ctx.command, sender: ctx.sender, motivo: cobro.motivo }, 'costo del comando sin cobrar')
      }
    }

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
          text: leveledUp > 1
            ? t(ctx.lang, 'subioNiveles', { nombre: name, n: leveledUp, nivel: newLevel })
            : t(ctx.lang, 'subioNivel', { nombre: name, nivel: newLevel }),
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
    // El antiban no dejó salir la respuesta: egress.ts ya lo avisó con el
    // motivo y cuándo reintentar. Una traza de error por cada mensaje no dice
    // nada más, y llenaba el log mientras el número estaba en calentamiento.
    if (err?.name === 'AntibanRejected') return
    logger.error({ err }, 'Error en handleMessage')
  } finally {
    releaseSlot()
    // Solo se ve cuando importa: si el mensaje tardó o se cortó por tiempo.
    // Lo normal queda en debug.
    const ms = Date.now() - _startedAt
    const nivel = timedOut || ms > 2_000 ? 'warn' : 'debug'
    logger[nivel]({ id: msg.key.id, active: _activeHandlers, ms, timedOut }, 'handleMessage END')
  }
}

// Para exponer el estado del semáforo en el heartbeat (src/index.ts) — así se
// ve en el mismo log que ya se vigila si el semáforo se está llenando.
export function getActiveHandlerCount(): number {
  return _activeHandlers
}