export interface ApiEnvelope<T> {
  code: 'OK'
  message: string
  data: T
  requestId: string
}

export interface ContentPage<T> {
  items: T[]
  page: number
  size: number
  total: number
  totalPages: number
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly requestId?: string

  constructor(message: string, status: number, requestId?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.requestId = requestId
  }
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | { message?: string; requestId?: string } | null
  if (!response.ok || !body || !('data' in body)) {
    throw new ApiRequestError(body?.message ?? '请求失败，请稍后重试', response.status, body?.requestId)
  }
  return body.data
}

export async function apiRequest<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, token?: string, extraHeaders?: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | { message?: string; requestId?: string } | null
  if (!response.ok || !payload || !('data' in payload)) {
    throw new ApiRequestError(payload?.message ?? '请求失败，请稍后重试', response.status, payload?.requestId)
  }
  return payload.data
}
