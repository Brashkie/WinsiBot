import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} from '@whiskeysockets/baileys'
import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import axios              from 'axios'
import { fileTypeFromBuffer } from 'file-type'
import { extractMentions } from './utils.js'
import { config } from '@config'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — INTERACTIVE MESSAGES
//  Botones nativos, listas, external ad reply (sylph) y álbumes de medios.
//  Puerto TypeScript de simple.js — Avenix-Multi / Hepein.
//  NLP pre-check via Rust · retry automático en relayMessage.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Newsletter ID para reply con forwarding ──────────────────────────────────
// Antes eran 4 canales de Brashkie hardcodeados — ahora sale de
// config.newsletterJid (NEWSLETTER_JID en .env), opcional. Sin canal propio
// configurado, _nl() devuelve null y los que lo usan mandan el mensaje sin
// el contexto de "reenviado desde canal" (mensaje normal, sin ese adorno).
const _nl = (): { id: string; name: string } | null =>
  config.newsletterJid ? { id: config.newsletterJid, name: `🎯 ${config.botName}` } : null

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Un botón quick_reply: texto visible + id de respuesta. */
export interface ButtonDef { text: string; id: string }

/** Un enlace en botón cta_url. */
export interface UrlDef { text: string; url: string }

/** Una card del carrusel interactivo. */
export interface CarouselCard {
  text:     string
  footer?:  string
  media?:   Buffer | string
  buttons:  Array<[string, string]>
  copy?:    string[]
  urls?:    Array<[string, string]>
  list?:    Array<[string, unknown[]]>
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Construye el objeto de opciones para generateWAMessageFromContent
 * evitando pasar `quoted: undefined` (incompatible con exactOptionalPropertyTypes).
 */
function _genOpts(sock: WASocket, quoted?: WAMessage): any {
  const base = { userJid: sock.user?.id ?? '' }
  return quoted ? { ...base, quoted } : base
}

/** relayMessage con retry automático (2 reintentos, backoff 500ms). */
async function _relay(
  sock:      WASocket,
  jid:       string,
  message:   any,
  messageId: string,
  retries    = 2,
): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try { await sock.relayMessage(jid, message, { messageId }); return } catch (e: any) {
      if (i === retries) throw e
      await new Promise<void>(r => setTimeout(r, 500 * (i + 1)))
    }
  }
}

/** Prepara una imagen o video para usarla en el header de botones/listas. */
async function _prepareMedia(
  sock:  WASocket,
  input: Buffer | string,
): Promise<Record<string, unknown> | null> {
  try {
    let buf:  Buffer
    let mime: string

    if (typeof input === 'string') {
      const res = await axios.get(input, { responseType: 'arraybuffer', timeout: 10_000 })
      buf  = Buffer.from(res.data as ArrayBuffer)
      mime = String(res.headers['content-type'] ?? 'application/octet-stream')
    } else {
      const ft = await fileTypeFromBuffer(input)
      buf  = input
      mime = ft?.mime ?? 'application/octet-stream'
    }

    if (mime.startsWith('image/')) {
      return await prepareWAMessageMedia(
        { image: buf } as any,
        { upload: sock.waUploadToServer },
      ) as unknown as Record<string, unknown>
    }
    if (mime.startsWith('video/')) {
      return await prepareWAMessageMedia(
        { video: buf } as any,
        { upload: sock.waUploadToServer },
      ) as unknown as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

// ─── 1. sendReply — texto con newsletter forwarding ───────────────────────────

/**
 * Envía un mensaje de texto con contextInfo de newsletter (estilo forwarded).
 * Equivale a `conn.reply()` en simple.js.
 */
export async function sendReply(
  sock:    WASocket,
  jid:     string,
  text:    string,
  quoted?: WAMessage,
): Promise<any> {
  const nl = _nl()
  return sock.sendMessage(
    jid,
    {
      text,
      contextInfo: {
        mentionedJid: extractMentions(text),
        ...(nl ? {
          isForwarded:  true,
          forwardingScore: 1,
          forwardedNewsletterMessageInfo: {
            newsletterJid:   nl.id,
            newsletterName:  nl.name,
            serverMessageId: Math.floor(Math.random() * 900) + 100,
          },
        } : {}),
      },
    } as any,
    quoted ? { quoted } : {},
  )
}

// ─── 2. sendButton — botones interactivos nativos ─────────────────────────────

/**
 * Envía botones interactivos nativos (quick_reply + opcionales cta_copy / cta_url).
 *
 * @param buttons  Array de { text, id } para quick_reply.
 * @param opts.media   Imagen o video opcional en el header (Buffer o URL).
 * @param opts.copy    Texto a copiar con el botón "Copiar" (cta_copy).
 * @param opts.urls    Array de { text, url } para botones de enlace (cta_url).
 * @param opts.quoted  Mensaje citado.
 */
async function sendButton(
  sock:    WASocket,
  jid:     string,
  text:    string,
  footer:  string,
  buttons: ButtonDef[],
  opts: {
    media?:  Buffer | string
    copy?:   string | number
    urls?:   UrlDef[]
    quoted?: WAMessage
  } = {},
): Promise<any> {
  const media = opts.media ? await _prepareMedia(sock, opts.media) : null
  const img   = media?.imageMessage
  const vid   = media?.videoMessage

  const dynamicButtons: unknown[] = buttons.map(b => ({
    name:             'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
  }))

  if (opts.copy != null) {
    dynamicButtons.push({
      name:             'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: 'Copiar', copy_code: String(opts.copy) }),
    })
  }

  for (const u of opts.urls ?? []) {
    dynamicButtons.push({
      name:             'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: u.text, url: u.url, merchant_url: u.url }),
    })
  }

  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body:   { text },
            footer: { text: footer },
            header: {
              hasMediaAttachment: !!(img || vid),
              imageMessage:  img  ?? null,
              videoMessage:  vid  ?? null,
            },
            nativeFlowMessage: {
              buttons:           dynamicButtons,
              messageParamsJson: '',
            },
          },
        },
      },
    } as any,
    _genOpts(sock, opts.quoted),
  )

  return _relay(sock, jid, msg.message!, msg.key.id!)
}

// ─── 7. sendCarousel — carrusel de cards interactivas (optimizado) ───────────

const CAROUSEL_MAX = 10

/**
 * Envía un carrusel horizontal de cards interactivas (≥ 2 cards, máx 10).
 * Con una sola card degrada automáticamente a sendButton.
 * Las cards con fallo de media se envían sin imagen (no abortan el carrusel).
 *
 * @param cards         Array de CarouselCard (mínimo 2 para carrusel real).
 * @param text          Texto del cuerpo exterior del carrusel.
 * @param footer        Pie de página global (se usa en cada card si no tiene el suyo).
 * @param opts.title    Título en el header exterior (por defecto usa `text`).
 * @param opts.subtitle Subtítulo en el header exterior.
 */
export async function sendCarousel(
  sock:    WASocket,
  jid:     string,
  text:    string,
  footer:  string,
  cards:   CarouselCard[],
  quoted?: WAMessage,
  opts: { title?: string; subtitle?: string } = {},
): Promise<void> {
  if (cards.length === 0) return

  if (cards.length === 1) {
    const c = cards[0]!
    const btnOpts: { media?: Buffer | string; quoted?: WAMessage } = {}
    if (c.media  !== undefined) btnOpts.media  = c.media
    if (quoted   !== undefined) btnOpts.quoted = quoted
    await sendButton(sock, jid, c.text, c.footer ?? footer,
      c.buttons.map(([t, id]) => ({ text: t, id })), btnOpts)
    return
  }

  const capped = cards.length > CAROUSEL_MAX
    ? (console.warn(`sendCarousel: ${cards.length} cards → cortado a ${CAROUSEL_MAX}`), cards.slice(0, CAROUSEL_MAX))
    : cards

  const builtCards = await Promise.all(capped.map(async (card) => {
    let img: unknown = null
    let vid: unknown = null
    if (card.media) {
      try {
        const prepared = await _prepareMedia(sock, card.media)
        img = prepared?.imageMessage ?? null
        vid = prepared?.videoMessage ?? null
      } catch { /* card se envía sin media */ }
    }

    const dynamicButtons: unknown[] = card.buttons.map(([display_text, id]) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text, id }),
    }))
    for (const code of card.copy ?? []) {
      dynamicButtons.push({
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({ display_text: 'Copiar', copy_code: code }),
      })
    }
    for (const [display_text, url] of card.urls ?? []) {
      dynamicButtons.push({
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text, url, merchant_url: url }),
      })
    }
    for (const [title, sections] of card.list ?? []) {
      dynamicButtons.push({
        name: 'single_select',
        buttonParamsJson: JSON.stringify({ title, sections }),
      })
    }

    return proto.Message.InteractiveMessage.create({
      body:   proto.Message.InteractiveMessage.Body.fromObject({ text: card.text }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: card.footer ?? footer }),
      header: proto.Message.InteractiveMessage.Header.fromObject({
        hasMediaAttachment: !!(img || vid),
        imageMessage: img,
        videoMessage: vid,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        buttons:           dynamicButtons,
        messageParamsJson: '',
      }),
    })
  }))

  const outerTitle    = opts.title    ?? text
  const outerSubtitle = opts.subtitle ?? ''

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body:   proto.Message.InteractiveMessage.Body.fromObject({ text }),
    footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: footer }),
    header: proto.Message.InteractiveMessage.Header.fromObject({
      hasMediaAttachment: false,
      title:    outerTitle,
      subtitle: outerSubtitle,
    }),
    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
      cards: builtCards,
    }),
  })

  const content = proto.Message.fromObject({
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata:        {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage,
      },
    },
  })

  const msg = generateWAMessageFromContent(jid, content as any, _genOpts(sock, quoted))
  await _relay(sock, jid, msg.message!, msg.key.id!)
}

