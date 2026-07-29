// Formas de respuesta de la API del dashboard — reflejadas en
// web/src/lib/types.ts del lado del frontend (no se pueden compartir el
// mismo archivo entre los dos proyectos TS, son builds independientes).

export type Role = 'owner' | 'user'

export interface SubBotSummary {
  phone:                 string
  name:                  string
  status:                'connecting' | 'connected' | 'disconnected'
  connectedAt:           number
  msgCount:              number
  lastMessageAt:         number
  lastDisconnectReason?: string
  lastDisconnectAt?:     number
}

export interface AdminGroupSummary {
  jid:  string
  name: string
}

export interface MeResponse {
  jid:         string
  role:        Role
  subbots:     SubBotSummary[]
  adminGroups: AdminGroupSummary[]
}
