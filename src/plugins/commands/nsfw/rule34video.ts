import type { Command } from '../../../types/index.js'
import { getGroupConfig, getUserData, chargeEmbers } from '@core/events.js'
import { searchRule34Video, getRule34VideoDetails } from '@lib/rule34video.js'
import { downloadBuffer } from '@lib/downloader.js'

const EMBER_COST = 1

// Búsqueda + resolver detalles + descargar el video son 3 pedidos de red
// SEGUIDOS, cada uno con su propio timeout de hasta 15s del lado de la lib —
// en el peor caso eso suma bastante más que los 20s que le da el handler
// central antes de "abandonar" el mensaje (libera el semáforo, pero el
// mensaje puede terminar mandándose muy tarde o directamente quedar la
// carga sin resolver si algo se cuelga de verdad). Este techo propio
// garantiza que el usuario SIEMPRE reciba una respuesta clara — éxito o
// error — dentro de un tiempo razonable, en vez de quedar el "Descargando
// video..." colgado sin explicación.
const OVERALL_TIMEOUT_MS = 18_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

const command: Command = {
  name:        'rule34video',
  aliases:     ['r34video', 'r34v', 'rvideo34'],
  description: 'Busca un video en Rule34Video — requiere nsfw activado',
  category:    'nsfw' as any,
  cooldown:    15,
  groupOnly:   true,

  async execute({ sock, jid, msg, args, prefix, sender }) {
    const config = getGroupConfig(jid)
    if (!config.nsfw) {
      await sock.sendMessage(jid, {
        text: `✗ Los comandos NSFW están desactivados en este grupo.\n\nPide a un admin que active:\n> ${prefix}on nsfw`,
      }, { quoted: msg })
      return
    }

    if (!chargeEmbers(sender, EMBER_COST)) {
      await sock.sendMessage(jid, {
        text: `✗ Te faltan BrasEmbers — necesitás *${EMBER_COST}* y tenés *${getUserData(sender).embers}*.\n§ Conseguí más con ${prefix}ascuas, o una chance random en ${prefix}daily/${prefix}work/${prefix}crime/${prefix}mine.`,
      }, { quoted: msg })
      return
    }

    const query = args.join(' ').trim()
    if (!query) {
      await sock.sendMessage(jid, {
        text: `✗ Especifica una búsqueda.\nEjemplo: ${prefix}rule34video hinata`,
      }, { quoted: msg })
      return
    }

    const results = await searchRule34Video(query).catch(() => [])
    if (!results.length) {
      await sock.sendMessage(jid, {
        text: `✗ No se encontraron videos para "${query}".`,
      }, { quoted: msg })
      return
    }

    const pick = results[Math.floor(Math.random() * results.length)]!

    const sent = await sock.sendMessage(jid, {
      text: `◈ Descargando video...`,
    }, { quoted: msg })
    const key = sent?.key

    const details = await withTimeout(
      getRule34VideoDetails(pick.pageUrl).catch(() => null),
      OVERALL_TIMEOUT_MS,
    )
    if (!details?.videoUrl) {
      await sock.sendMessage(jid, {
        text: `✗ No se pudo descargar el video (tardó demasiado o el sitio no respondió), intenta de nuevo.`,
        edit: key,
      } as any)
      return
    }

    const buffer = await withTimeout(
      downloadBuffer(details.videoUrl).catch(() => null),
      OVERALL_TIMEOUT_MS,
    )
    if (!buffer) {
      await sock.sendMessage(jid, {
        text: `✗ No se pudo descargar el video (tardó demasiado o el sitio no respondió), intenta de nuevo.`,
        edit: key,
      } as any)
      return
    }

    await sock.sendMessage(jid, { text: '✔ Listo', edit: key } as any)

    const caption = [
      `🔞 *${details.title}*`,
      ``,
      details.artist     ? `> ❖ Artista › *${details.artist}*` : '',
      details.uploader    ? `> § Subido por › *${details.uploader}*` : '',
      details.uploadedAt  ? `> ✩ Publicado › *${details.uploadedAt}*` : '',
      details.views       ? `> ❀ Vistas › *${details.views}*` : '',
      details.duration    ? `> ⴵ Duración › *${details.duration}*` : '',
      details.categories.length ? `> ❒ Categorías › *${details.categories.join(', ')}*` : '',
    ].filter(Boolean).join('\n')

    await sock.sendMessage(jid, {
      video:   buffer,
      caption,
    }, { quoted: msg })
  },
}

export default command
