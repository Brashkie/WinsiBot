import { createFileRoute, Outlet, redirect, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { meQueryOptions } from '../lib/auth.js'
import { api } from '../lib/api.js'

// Layout route (el "_" al inicio no agrega nada a la URL) — todo lo que
// necesita sesión cuelga de acá: un solo guard, un solo nav compartido.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQueryOptions).catch(() => null)
    if (!me) throw redirect({ to: '/login' })
    return { me }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const { data: me } = useQuery(meQueryOptions)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function logout() {
    await api.post('/auth/logout').catch(() => {})
    queryClient.clear()
    navigate({ to: '/login' })
  }

  if (!me) return null

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-6">
          <span className="font-semibold">WinsiBot</span>
          <nav className="flex gap-4 text-sm text-neutral-500">
            {me.role === 'owner' && (
              <Link to="/admin" className="hover:text-neutral-900 dark:hover:text-white" activeProps={{ className: 'text-neutral-900 dark:text-white font-medium' }}>
                Admin
              </Link>
            )}
            <Link to="/subbots" className="hover:text-neutral-900 dark:hover:text-white" activeProps={{ className: 'text-neutral-900 dark:text-white font-medium' }}>
              Mis sub-bots
            </Link>
            <Link to="/groups" className="hover:text-neutral-900 dark:hover:text-white" activeProps={{ className: 'text-neutral-900 dark:text-white font-medium' }}>
              Mis grupos
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>+{me.jid.split('@')[0]}</span>
          <button onClick={logout} className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
