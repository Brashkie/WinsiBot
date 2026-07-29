import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryOptions } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api.js'
import { meQueryOptions } from '../lib/auth.js'
import { useSocketListener } from '../lib/useSocket.js'

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQueryOptions).catch(() => null)
    if (me?.role !== 'owner') throw redirect({ to: '/subbots' })
  },
  component: AdminPage,
})

interface AdminStats {
  totalUsers:      number
  totalMessages:   number
  totalCommands:   number
  messagesToday:   number
  commandsToday:   number
  bannedUsers:     number
  premiumUsers:    number
  activeSubbots:   number
  topCommands:     Array<{ command: string; count: number }>
}

interface FeedItem {
  ts:   number
  type: string
  text: string
}

const statsQuery = queryOptions({
  queryKey: ['admin-stats'],
  queryFn:  () => api.get<AdminStats>('/admin/stats'),
  refetchInterval: 15_000,
})

function AdminPage() {
  const { data } = useQuery(statsQuery)
  const queryClient = useQueryClient()
  const [feed, setFeed] = useState<FeedItem[]>([])

  useSocketListener((msg) => {
    if (msg.type === 'stats_tick') {
      queryClient.invalidateQueries({ queryKey: statsQuery.queryKey })
    }
    if (msg.type === 'event') {
      setFeed((prev) => [msg.payload as FeedItem, ...prev].slice(0, 50))
    }
  })

  if (!data) return <p className="text-sm text-neutral-500">Cargando...</p>

  const cards: Array<[string, number]> = [
    ['Usuarios', data.totalUsers],
    ['Mensajes', data.totalMessages],
    ['Comandos', data.totalCommands],
    ['Hoy · mensajes', data.messagesToday],
    ['Hoy · comandos', data.commandsToday],
    ['Sub-bots activos', data.activeSubbots],
    ['Premium', data.premiumUsers],
    ['Baneados', data.bannedUsers],
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Admin</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Top comandos</h2>
          <div className="space-y-1">
            {data.topCommands.slice(0, 8).map((c, i) => (
              <div key={c.command} className="flex justify-between text-sm">
                <span>{i + 1}. {c.command}</span>
                <span className="text-neutral-500">{c.count}x</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">Eventos en vivo</h2>
          <div className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {feed.length === 0 && <p className="text-neutral-400">Esperando eventos...</p>}
            {feed.map((f, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-neutral-100 py-1 dark:border-neutral-800">
                <span className="truncate">{f.text}</span>
                <span className="shrink-0 text-neutral-400">{new Date(f.ts).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
