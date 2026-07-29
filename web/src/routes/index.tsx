import { createFileRoute, redirect } from '@tanstack/react-router'
import { meQueryOptions } from '../lib/auth.js'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQueryOptions).catch(() => null)
    if (!me) throw redirect({ to: '/login' })
    throw redirect({ to: me.role === 'owner' ? '/admin' : '/subbots' })
  },
})
