import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { meQueryOptions } from '../lib/auth.js'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

interface StartResponse { code: string }
interface StatusResponse { confirmed: boolean }

function LoginPage() {
  const [phone, setPhone]   = useState('')
  const [code, setCode]     = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const digits = phone.replace(/\D/g, '')
      if (!digits) { setError('Escribí un número válido'); return }

      const res = await api.post<StartResponse>('/auth/start', { phone: digits })
      setCode(res.code)

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get<StatusResponse>(`/auth/status/${res.code}`)
          if (status.confirmed) {
            if (pollRef.current) clearInterval(pollRef.current)
            await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
            navigate({ to: '/' })
          }
        } catch { /* seguir esperando */ }
      }, 2_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el código')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current)
    setCode(null)
    setError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="mb-1 text-2xl font-semibold">WinsiBot</h1>
        <p className="mb-6 text-sm text-neutral-500">Iniciá sesión con tu WhatsApp</p>

        {!code ? (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Tu número de WhatsApp
              </label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="51999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-neutral-900 py-2 font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {loading ? 'Generando código...' : 'Continuar con WhatsApp'}
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-neutral-500">Mandale este código al bot por WhatsApp:</p>
            <div className="rounded-lg bg-neutral-100 py-4 font-mono text-3xl font-bold tracking-widest dark:bg-neutral-800">
              {code}
            </div>
            <p className="text-sm text-neutral-500">
              Escribí <span className="font-mono font-semibold">#login {code}</span> en tu chat con el bot
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Esperando confirmación...
            </div>
            <button onClick={reset} className="text-sm text-neutral-500 underline">
              Usar otro número
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
