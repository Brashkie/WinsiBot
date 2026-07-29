// Tipos compartidos entre las páginas del dashboard — reflejan las formas
// que devuelve src/dashboard/ (backend Node), no tipos propios de UI.

export type Role = 'owner' | 'user'

export interface SubBotSummary {
  phone:                 string
  name:                  string
  status:                'connecting' | 'connected' | 'disconnected'
  connectedAt:           number
  msgCount:               number
  lastMessageAt:          number
  lastDisconnectReason?:  string
  lastDisconnectAt?:      number
}

export interface AdminGroupSummary {
  jid:  string
  name: string
}

export interface MeResponse {
  jid:          string
  role:         Role
  subbots:      SubBotSummary[]
  adminGroups:  AdminGroupSummary[]
}
