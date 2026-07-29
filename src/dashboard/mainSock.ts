// mainSock.ts — referencia compartida al WASocket del bot principal, seteada
// una vez al arrancar (ver server.ts). Único lugar que la guarda — evitar
// que cada módulo del dashboard tenga su propia copia suelta.
import type { WASocket } from '@whiskeysockets/baileys'

let _sock: WASocket | null = null

export function setMainSock(sock: WASocket): void {
  _sock = sock
}

export function getMainSock(): WASocket | null {
  return _sock
}
