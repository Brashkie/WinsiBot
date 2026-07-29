import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryOptions } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api.js'
import { meQueryOptions } from '../lib/auth.js'

export const Route = createFileRoute('/_authed/groups')({
  component: GroupsPage,
})

interface ToggleOption {
  key:         string
  label:       string
  description: string
  ownerOnly:   boolean
}

interface GroupConfigResponse {
  options: ToggleOption[]
  values:  Record<string, boolean>
}

function groupConfigOptions(jid: string) {
  return queryOptions({
    queryKey: ['group-config', jid],
    queryFn:  () => api.get<GroupConfigResponse>(`/groups/${encodeURIComponent(jid)}/config`),
  })
}

function GroupsPage() {
  const { data: me } = useQuery(meQueryOptions)
  const [selected, setSelected] = useState<string | null>(null)

  if (!me) return null

  if (me.adminGroups.length === 0) {
    return <p className="text-sm text-neutral-500">No sos admin de ningún grupo donde esté el bot.</p>
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
      <div className="space-y-1">
        <h1 className="mb-3 text-xl font-semibold">Mis grupos</h1>
        {me.adminGroups.map((g) => (
          <button
            key={g.jid}
            onClick={() => setSelected(g.jid)}
            className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm ${
              selected === g.jid
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div>
        {selected
          ? <GroupToggles jid={selected} />
          : <p className="text-sm text-neutral-500">Elegí un grupo de la izquierda.</p>}
      </div>
    </div>
  )
}

function GroupToggles({ jid }: { jid: string }) {
  const { data, isLoading } = useQuery(groupConfigOptions(jid))
  const queryClient = useQueryClient()

  const toggle = useMutation({
    mutationFn: (key: string) =>
      api.patch(`/groups/${encodeURIComponent(jid)}/config`, {
        key, value: !data?.values[key],
      }),
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: groupConfigOptions(jid).queryKey })
      const prev = queryClient.getQueryData(groupConfigOptions(jid).queryKey)
      queryClient.setQueryData(groupConfigOptions(jid).queryKey, (old: GroupConfigResponse | undefined) =>
        old && { ...old, values: { ...old.values, [key]: !old.values[key] } })
      return { prev }
    },
    onError: (_err, _key, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(groupConfigOptions(jid).queryKey, ctx.prev)
    },
  })

  if (isLoading || !data) return <p className="text-sm text-neutral-500">Cargando...</p>

  return (
    <div className="space-y-2">
      {data.options.map((opt) => (
        <label
          key={opt.key}
          className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
        >
          <div>
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="text-xs text-neutral-500">{opt.description}</div>
          </div>
          <input
            type="checkbox"
            checked={data.values[opt.key] ?? false}
            onChange={() => toggle.mutate(opt.key)}
            className="h-5 w-5 accent-neutral-900 dark:accent-white"
          />
        </label>
      ))}
    </div>
  )
}
