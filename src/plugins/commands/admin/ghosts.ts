import type { Command } from '../../../types/index.js'
import { safeSend } from '@lib/media_sender.js'
import { getGroupActivity } from '@lib/nativeBridge.js'
import { miembros, esElBot, type Miembro } from '@lib/members.js'
import { winsiStore } from '@core/store.js'
import { fechaHoraLocal, sleep } from '@lib/utils.js'
import { logger } from '@core/logger.js'

// #fantasmas: los miembros que no escribieron en N días, y sacarlos si el
// admin lo confirma.
//
// "No escribió" sale de los mensajes que el bot registra: si el bot está en el
// grupo hace 5 días, nadie lleva 30 sin escribir según sus datos, aunque sea
// cierto. Por eso, si el registro es más corto que la ventana pedida, se
// muestra la lista con la advertencia y NO se deja expulsar.
//
// Expulsar es lo único de este lote que no se deshace: pide confirmación,
// nunca toca a admins, al bot ni a quien lo pide, y va en tandas chicas con
// pausa —sacar a 40 de golpe es justo lo que WhatsApp mira con desconfianza—.

const TANDA = 5
const PAUSA = 3_000
const MAX_POR_VEZ = 50
const CONFIRMAR = 2 * 60_000

interface Pendiente { quien: string; lista: Miembro[]; vence: number }
const pendientes = new Map<string, Pendiente>()   // gjid → la expulsión por confirmar

async function fantasmas(sock: any, jid: string, dias: number) {
  const [r, ms] = await Promise.all([getGroupActivity(jid, dias), miembros(sock, jid)])
  if (!r) return null
  const activos = new Set(r.activity.miembros.map(m => m.sender))
  // El bot no cuenta: ni como fantasma ni en el total ("2 de 5" con el bot era 2 de 4).
  const personas = ms.filter(m => !esElBot(sock, m))
  const lista = personas.filter(m => !m.ids.some(i => activos.has(i)))
  const desde = r.activity.registro_desde
  const completo = desde !== null && Date.now() - desde >= dias * 86_400_000
  return { lista, total: personas.length, desde, completo }
}

const command: Command = {
  name:        'fantasmas',
  aliases:     ['ghosts', 'inactivos', 'fantasma'],
  description: 'Los miembros que no escribieron en N días  |  !fantasmas [días]  ·  !fantasmas sacar [días]',
  category:    'admin',
  cooldown:    10,
  groupOnly:   true,
  adminOnly:   true,

  async execute({ sock, jid, msg, sender, args, prefix, isBotAdmin }) {
    const sub = (args[0] ?? '').toLowerCase()
    const responder = (text: string, mentions: string[] = []) =>
      safeSend(() => sock.sendMessage(jid, { text, mentions }, { quoted: msg }))

    // ─── !fantasmas confirmar ──────────────────────────────────────────────
    if (sub === 'confirmar' || sub === 'confirm' || sub === 'si') {
      const p = pendientes.get(jid)
      if (p && Date.now() > p.vence) pendientes.delete(jid)
      // Solo la confirma quien la pidió; que otro escriba "confirmar" no la
      // anula (antes se borraba, y cualquiera la cancelaba sin querer).
      if (!p || Date.now() > p.vence || p.quien !== sender) {
        await responder(`> No hay ninguna expulsión tuya por confirmar (vencen a los ${CONFIRMAR / 60_000} min).`)
        return
      }
      pendientes.delete(jid)
      if (!isBotAdmin) {
        await responder(`> Necesito ser admin del grupo para sacar a alguien.`)
        return
      }
      let sacados = 0
      for (let i = 0; i < p.lista.length; i += TANDA) {
        const tanda = p.lista.slice(i, i + TANDA).map(m => m.id)
        try {
          await sock.groupParticipantsUpdate(jid, tanda, 'remove')
          sacados += tanda.length
        } catch (err) {
          logger.warn({ err, jid }, 'fantasmas: no se pudo sacar una tanda')
          break
        }
        if (i + TANDA < p.lista.length) await sleep(PAUSA)
      }
      await responder(`👻 Saqué a *${sacados}* de ${p.lista.length} inactivo(s).${sacados < p.lista.length ? ' WhatsApp rechazó el resto.' : ''}`)
      return
    }

    const sacar = sub === 'sacar' || sub === 'kick' || sub === 'expulsar'
    const dias = Math.min(Math.max(parseInt(sacar ? args[1] ?? '' : args[0] ?? '') || 30, 1), 365)
    const f = await fantasmas(sock, jid, dias).catch(() => null)
    if (!f) {
      await responder(`> No pude leer la actividad del grupo ahora. Intenta en un rato.`)
      return
    }
    const aviso = f.completo
      ? ''
      : f.desde === null
        ? `\n> ⚠️ Todavía no hay mensajes registrados de este grupo: todos figuran como fantasmas.`
        : `\n> ⚠️ Solo hay registro desde el ${fechaHoraLocal(f.desde)}: la lista es "desde entonces", no de ${dias} días.`

    if (!f.lista.length) {
      await responder(`✨ Nadie lleva ${dias} días sin escribir.${aviso}`)
      return
    }

    // Nombres y no menciones: listar no tiene que notificar a 40 personas.
    const nombres = f.lista.slice(0, 40).map((m, i) => `  ${i + 1}. ${winsiStore.getName(m.numero ?? m.id)}${m.admin ? ' 👑' : ''}`)
    const texto = [
      `👻 *${f.lista.length} de ${f.total}* no escribieron en ${dias} días:`,
      ...nombres,
      f.lista.length > 40 ? `  …y ${f.lista.length - 40} más` : '',
    ].filter(Boolean).join('\n')

    if (!sacar) {
      await responder(`${texto}${aviso}\n\n> \`${prefix}fantasmas sacar ${dias}\` para sacarlos (sin los admins)`)
      return
    }

    // ─── !fantasmas sacar ──────────────────────────────────────────────────
    if (!f.completo) {
      await responder(`${texto}${aviso}\n\n> ❌ No saco a nadie con un registro más corto que la ventana: podría estar sacando a gente activa.`)
      return
    }
    if (!isBotAdmin) {
      await responder(`> Necesito ser admin del grupo para sacar a alguien.`)
      return
    }
    const sacables = f.lista.filter(m => !m.admin && !m.ids.includes(sender))
    const lista = sacables.slice(0, MAX_POR_VEZ)
    if (!lista.length) {
      await responder(`> Los inactivos son todos admins: no saco a nadie.`)
      return
    }
    const admins = f.lista.length - sacables.length
    pendientes.set(jid, { quien: sender, lista, vence: Date.now() + CONFIRMAR })
    await responder([
      texto,
      ``,
      `⚠️ Voy a sacar a *${lista.length}*. No se puede deshacer.`,
      admins ? `> ${admins} admin(s) inactivo(s) no se tocan.` : '',
      sacables.length > lista.length ? `> Saco de a ${MAX_POR_VEZ}: para el resto, repite el comando después.` : '',
      `> \`${prefix}fantasmas confirmar\` en los próximos ${CONFIRMAR / 60_000} min.`,
    ].filter(Boolean).join('\n'))
  },
}

export default command
