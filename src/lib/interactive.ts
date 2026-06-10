import {
  generateWAMessageFromContent,
  generateWAMessage,
  prepareWAMessageMedia,
  proto,
} from '@whiskeysockets/baileys'
import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import axios              from 'axios'
import { fileTypeFromBuffer } from 'file-type'
import { extractMentions } from './utils.js'

// ─────────────────────────────────────────────────────────────────────────────
//  WinsiBot — INTERACTIVE MESSAGES
//  Botones nativos, listas, external ad reply (sylph) y álbumes de medios.
//  Puerto TypeScript de simple.js — Avenix-Multi / Hepein.
//  NLP pre-check via Rust · retry automático en relayMessage.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Newsletter IDs para reply con forwarding ─────────────────────────────────

const NL = [
  { id: '120363197223158904@newsletter', name: '🎯 WinsiBot Canal 1' },
  { id: '120363420749165706@newsletter', name: '🔥 WinsiBot Canal 2' },
  { id: '120363418424557294@newsletter', name: '⚡ WinsiBot Canal 3' },
  { id: '120363402823922168@newsletter', name: '🌐 WinsiBot Canal 4' },
]
const _nl = () => NL[Math.floor(Math.random() * NL.length)]!

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Un botón quick_reply: texto visible + id de respuesta. */
export interface ButtonDef { text: string; id: string }

/** Un enlace en botón cta_url. */
export interface UrlDef { text: string; url: string }

/** Una sección de lista interactiva. */
export interface ListSection {
  title: string
  rows:  Array<{
    header?:      string
    title:        string
    description?: string
    id:           string
  }>
}

/** Un elemento de álbum: imagen o video con caption opcional. */
export interface AlbumMedia {
  type:     'image' | 'video'
  data:     Buffer | { url: string }
  caption?: string
}

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

/** Parámetros para un botón de WhatsApp Flow (formulario interactivo). */
export interface FlowButton {
  flowId:    string
  flowToken: string
  flowCta:   string
  screen?:   string
  data?:     Record<string, unknown>
}

/** Definición de un producto individual. */
export interface ProductDef {
  image:        Buffer | string
  productId:    string
  title:        string
  description?: string
  currency?:    string
  /** Precio en centavos ×1000 — ej: $10.00 USD = 10_000 */
  price?:       number
  retailerId?:  string
  url?:         string
}

/** Producto ligero para usar en catálogo. */
export interface CatalogProduct {
  image?:       Buffer | string
  productId:    string
  title:        string
  description?: string
  currency?:    string
  price?:       number
  url?:         string
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
        isForwarded:  true,
        forwardingScore: 1,
        forwardedNewsletterMessageInfo: {
          newsletterJid:   nl.id,
          newsletterName:  nl.name,
          serverMessageId: Math.floor(Math.random() * 900) + 100,
        },
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
export async function sendButton(
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

// ─── 3. sendList — lista interactiva (sin media en header) ───────────────────

/**
 * Envía una lista interactiva con secciones (single_select).
 */
export async function sendList(
  sock:       WASocket,
  jid:        string,
  title:      string,
  body:       string,
  buttonText: string,
  sections:   ListSection[],
  quoted?:    WAMessage,
): Promise<any> {
  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: { title },
            body:   { text: body },
            nativeFlowMessage: {
              buttons: [{
                name:             'single_select',
                buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
              }],
              messageParamsJson: '',
            },
          },
        },
      },
    } as any,
    _genOpts(sock, quoted),
  )

  return _relay(sock, jid, msg.message!, msg.key.id!)
}

// ─── 4. sendListB — lista interactiva con imagen/video en header ──────────────

/**
 * Igual que sendList pero con imagen o video en el header.
 */
export async function sendListB(
  sock:       WASocket,
  jid:        string,
  title:      string,
  body:       string,
  buttonText: string,
  sections:   ListSection[],
  media:      Buffer | string,
  quoted?:    WAMessage,
): Promise<any> {
  const prepared = await _prepareMedia(sock, media)
  const img = prepared?.imageMessage
  const vid = prepared?.videoMessage

  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title,
              hasMediaAttachment: !!(img || vid),
              imageMessage:  img ?? null,
              videoMessage:  vid ?? null,
            },
            body: { text: body },
            nativeFlowMessage: {
              buttons: [{
                name:             'single_select',
                buttonParamsJson: JSON.stringify({ title: buttonText, sections }),
              }],
              messageParamsJson: '',
            },
          },
        },
      },
    } as any,
    _genOpts(sock, quoted),
  )

  return sock.relayMessage(jid, msg.message!, { messageId: msg.key.id! })
}

// ─── 5. sendSylph — external ad reply (thumbnail + URL clicable) ─────────────

/**
 * Envía un mensaje con externalAdReply: título, descripción,
 * thumbnail y URL clicable. Útil para "cards" visuales.
 */
export async function sendSylph(
  sock:       WASocket,
  jid:        string,
  text:       string,
  title:      string,
  body:       string,
  sourceUrl:  string,
  thumbnail?: Buffer,
  quoted?:    WAMessage,
): Promise<any> {
  const msg = generateWAMessageFromContent(
    jid,
    {
      extendedTextMessage: {
        text,
        contextInfo: {
          mentionedJid: extractMentions(text),
          externalAdReply: {
            title,
            body,
            thumbnail:         thumbnail ?? null,
            sourceUrl,
            showAdAttribution: true,
          },
        },
      },
    } as any,
    _genOpts(sock, quoted),
  )

  return _relay(sock, jid, msg.message!, msg.key.id!)
}

// ─── 6. sendAlbum — álbum de medios (albumMessage) ───────────────────────────

/**
 * Envía un álbum con 2+ imágenes/videos, agrupados como álbum nativo.
 * Equivale a `conn.sendSylphy()` en simple.js.
 */
export async function sendAlbum(
  sock:   WASocket,
  jid:    string,
  medias: AlbumMedia[],
  opts: {
    quoted?: WAMessage
    delay?:  number
  } = {},
): Promise<any> {
  if (medias.length < 2) throw new Error('sendAlbum: se necesitan al menos 2 medias')

  const delay   = opts.delay ?? 500
  const userJid = sock.user?.id ?? ''

  const albumContent: any = {
    messageContextInfo: {},
    albumMessage: {
      expectedImageCount: medias.filter(m => m.type === 'image').length,
      expectedVideoCount: medias.filter(m => m.type === 'video').length,
    },
  }

  if (opts.quoted) {
    albumContent.albumMessage.contextInfo = {
      remoteJid:     opts.quoted.key.remoteJid,
      fromMe:        opts.quoted.key.fromMe ?? false,
      stanzaId:      opts.quoted.key.id,
      participant:   opts.quoted.key.participant ?? opts.quoted.key.remoteJid,
      quotedMessage: opts.quoted.message!,
    }
  }

  const album = generateWAMessageFromContent(jid, albumContent, { userJid })

  await _relay(sock, album.key.remoteJid!, album.message!, album.key.id!)

  for (const media of medias) {
    const wamsg = await generateWAMessage(
      album.key.remoteJid!,
      { [media.type]: media.data, caption: media.caption ?? '' } as any,
      { upload: sock.waUploadToServer, userJid },
    )

    ;(wamsg.message as any).messageContextInfo = {
      messageAssociation: {
        associationType:  1,
        parentMessageKey: album.key,
      },
    }

    await _relay(sock, wamsg.key.remoteJid!, wamsg.message!, wamsg.key.id!)
    await new Promise<void>(r => setTimeout(r, delay))
  }

  return album
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

// ─── 8. sendFlow — formulario interactivo (WhatsApp Flows) ───────────────────

/**
 * Envía un botón que abre un WhatsApp Flow (formulario interactivo nativo).
 * Requiere un Flow ID activo en Meta Business Manager.
 *
 * @param flow.flowId    ID del Flow en Meta (ej: "1234567890")
 * @param flow.flowToken Token único de sesión (puede ser "unused" para flows sin auth)
 * @param flow.flowCta   Texto del botón de apertura (ej: "Abrir formulario")
 * @param flow.screen    Pantalla inicial del flow (default "WELCOME")
 * @param flow.data      Datos iniciales a pasar al flow
 */
export async function sendFlow(
  sock:    WASocket,
  jid:     string,
  text:    string,
  footer:  string,
  flow:    FlowButton,
  opts: {
    media?:  Buffer | string
    quoted?: WAMessage
  } = {},
): Promise<any> {
  const media = opts.media ? await _prepareMedia(sock, opts.media) : null
  const img   = media?.imageMessage
  const vid   = media?.videoMessage

  const flowParams = {
    flow_message_version: '3',
    flow_token:           flow.flowToken,
    flow_id:              flow.flowId,
    flow_cta:             flow.flowCta,
    flow_action:          'navigate',
    flow_action_payload: {
      screen: flow.screen ?? 'WELCOME',
      data:   flow.data   ?? {},
    },
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
              imageMessage: img  ?? null,
              videoMessage: vid  ?? null,
            },
            nativeFlowMessage: {
              buttons: [{
                name:             'flow',
                buttonParamsJson: JSON.stringify(flowParams),
              }],
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

// ─── 9. sendProduct — producto individual (WhatsApp Business) ────────────────

/**
 * Envía un mensaje de producto individual (requiere cuenta WhatsApp Business
 * con catálogo configurado en Meta Business Manager).
 *
 * @param product.price  Precio en centavos ×1000 — ej: $10.00 = 10_000
 */
export async function sendProduct(
  sock:         WASocket,
  jid:          string,
  product:      ProductDef,
  businessJid?: string,
  quoted?:      WAMessage,
): Promise<any> {
  const prepared   = await _prepareMedia(sock, product.image)
  const productImg = prepared?.imageMessage ?? null

  const msg = generateWAMessageFromContent(
    jid,
    {
      productMessage: {
        product: {
          productImage:      productImg,
          productId:         product.productId,
          title:             product.title,
          description:       product.description    ?? '',
          currencyCode:      product.currency       ?? 'USD',
          priceAmount1000:   product.price          ?? 0,
          retailerId:        product.retailerId      ?? '',
          url:               product.url            ?? '',
          productImageCount: productImg ? 1 : 0,
        },
        businessOwnerJid: businessJid ?? sock.user?.id ?? '',
      },
    } as any,
    _genOpts(sock, quoted),
  )

  return _relay(sock, jid, msg.message!, msg.key.id!)
}

// ─── 10. sendCatalog — catálogo de productos ─────────────────────────────────

/**
 * Envía un catálogo de productos como carrusel interactivo.
 * Cada card muestra imagen, título, precio y un botón "Ver producto".
 *
 * Para 1 producto usa sendProduct directamente.
 * Para 2–10 productos usa sendCarousel con una card por producto.
 *
 * @param businessJid  JID de la cuenta business (default: sock.user.id).
 *                     Solo aplica cuando products.length === 1.
 */
export async function sendCatalog(
  sock:         WASocket,
  jid:          string,
  title:        string,
  body:         string,
  products:     CatalogProduct[],
  businessJid?: string,
  quoted?:      WAMessage,
): Promise<void> {
  if (products.length === 0) return

  if (products.length === 1) {
    const p = products[0]!
    const def: ProductDef = {
      image:     p.image ?? Buffer.alloc(0),
      productId: p.productId,
      title:     p.title,
      ...(p.description !== undefined ? { description: p.description } : {}),
      ...(p.currency    !== undefined ? { currency:    p.currency    } : {}),
      ...(p.price       !== undefined ? { price:       p.price       } : {}),
      ...(p.url         !== undefined ? { url:         p.url         } : {}),
    }
    await sendProduct(sock, jid, def, businessJid, quoted)
    return
  }

  const priceLabel = (p: CatalogProduct) =>
    p.price ? `${p.currency ?? 'USD'} ${(p.price / 1000).toFixed(2)}` : ''

  const cards: CarouselCard[] = products.map(p => {
    const card: CarouselCard = {
      text:    `*${p.title}*${p.description ? `\n${p.description}` : ''}`,
      footer:  priceLabel(p),
      buttons: [['🛒 Ver producto', `!product ${p.productId}`]],
    }
    if (p.image !== undefined) card.media = p.image
    if (p.url   !== undefined) card.urls  = [['🔗 Más info', p.url]]
    return card
  })

  await sendCarousel(sock, jid, body, title, cards, quoted, { title })
}
