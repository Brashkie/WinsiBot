import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { meQueryOptions } from '../lib/auth.js'
import { useSocketListener } from '../lib/useSocket.js'
import type { SubBotSummary } from '../lib/types.js'

export const Route = createFileRoute('/_authed/subbots')({
  component: SubBotsPage,
})

const STATUS_LABEL: Record<SubBotSummary['status'], string> = {
  connected:    'Conectado',
  connecting:   'Conectando...',
  disconnected: 'Desconectado',
}

const STATUS_DOT: Record<SubBotSummary['status'], string> = {
  connected:    'bg-emerald-500',
  connecting:   'bg-amber-500 animate-pulse',
  disconnected: 'bg-neutral-400',
}

function SubBotsPage() {
  const { data: me } = useQuery(meQueryOptions)
  const queryClient = useQueryClient()

  useSocketListener((msg) => {
    if (msg.type === 'subbot_status') {
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
    }
  })

  const [connecting, setConnecting] = useState(false)
  const [pairing, setPairing] = useState<{ qr?: string; code?: string } | null>(null)

  const connectMutation = useMutation({
    mutationFn: (phone: string) => api.post<{ qr?: string; code?: string }>(`/subbots/${phone}/connect`),
    onSuccess: (res) => setPairing(res),
  })

  if (!me) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis sub-bots</h1>
        {me.subbots.length === 0 && !connecting && (
          <button
            onClick={() => { setConnecting(true); connectMutation.mutate(me.jid.split('@')[0]!) }}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            Conectar sub-bot
          </button>
        )}
      </div>

      {pairing && (
        <div className="rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
          {pairing.qr ? (
            <img src={pairing.qr} alt="QR" className="mx-auto h-56 w-56" />
          ) : pairing.code ? (
            <div className="font-mono text-2xl font-bold tracking-widest">{pairing.code}</div>
          ) : null}
          <p className="mt-3 text-sm text-neutral-500">Escaneá desde WhatsApp → Dispositivos vinculados</p>
        </div>
      )}

      {me.subbots.length === 0 && !pairing && (
        <p className="text-sm text-neutral-500">Todavía no tenés ningún sub-bot conectado.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {me.subbots.map((bot) => (
          <SubBotCard key={bot.phone} bot={bot} />
        ))}
      </div>
    </div>
  )
}

function SubBotCard({ bot }: { bot: SubBotSummary }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mediaKey, setMediaKey] = useState('')
  const [nameInput, setNameInput] = useState(bot.name)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })

  const disconnectMutation = useMutation({
    mutationFn: () => api.post(`/subbots/${bot.phone}/disconnect`),
    onSuccess: invalidate,
  })

  const setNameMutation = useMutation({
    mutationFn: (name: string) => api.post(`/subbots/${bot.phone}/setname`, { name }),
    onSuccess: invalidate,
  })

  const setMediaMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('key', mediaKey)
      form.append('file', file)
      return api.upload(`/subbots/${bot.phone}/setmedia`, form)
    },
  })

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[bot.status]}`} />
          <span className="font-medium">{bot.name}</span>
        </div>
        <span className="text-xs text-neutral-500">{STATUS_LABEL[bot.status]}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm text-neutral-500">
        <dt>Número</dt><dd>+{bot.phone}</dd>
        <dt>Mensajes</dt><dd>{bot.msgCount}</dd>
        {bot.lastDisconnectReason && (
          <>
            <dt>Última caída</dt><dd className="truncate">{bot.lastDisconnectReason}</dd>
          </>
        )}
      </dl>

      <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <div className="flex gap-2">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            onClick={() => setNameMutation.mutate(nameInput)}
            disabled={setNameMutation.isPending}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Renombrar
          </button>
        </div>

        <div className="flex gap-2">
          <input
            placeholder="clave (ej. menu)"
            value={mediaKey}
            onChange={(e) => setMediaKey(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f && mediaKey) setMediaMutation.mutate(f) }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!mediaKey || setMediaMutation.isPending}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Subir medio
          </button>
        </div>

        <button
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="w-full rounded-md border border-red-300 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          Desconectar
        </button>
      </div>
    </div>
  )
}
