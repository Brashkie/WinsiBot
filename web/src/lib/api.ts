// api.ts — cliente HTTP para la API del dashboard (src/dashboard/).
// La cookie de sesión httpOnly viaja sola con `credentials: 'include'` — no
// hay token que manejar a mano acá.

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`)
  }

  return body as T
}

export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch:  <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  del:    <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  // multipart (setmedia) — sin Content-Type manual, el browser arma el
  // boundary solo.
  upload: <T>(path: string, formData: FormData) =>
    fetch(`/api${path}`, { method: 'POST', credentials: 'include', body: formData })
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new ApiError(res.status, body?.error ?? `Error ${res.status}`)
        return body as T
      }),
}
