import { queryOptions } from '@tanstack/react-query'
import { api, ApiError } from './api.js'
import type { MeResponse } from './types.js'

export const meQueryOptions = queryOptions({
  queryKey: ['me'],
  queryFn: () => api.get<MeResponse>('/me'),
  retry: (failureCount, err) => err instanceof ApiError && err.status === 401 ? false : failureCount < 2,
  staleTime: 30_000,
})
