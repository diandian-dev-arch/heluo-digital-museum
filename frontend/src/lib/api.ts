export interface ApiEnvelope<T> {
  code: 'OK'
  message: string
  data: T
  requestId: string
}

interface ApiFailure {
  code?: string
  message?: string
  requestId?: string
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
  readonly code?: string

  constructor(message: string, status: number, requestId?: string, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.requestId = requestId
    this.code = code
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

let unauthorizedHandler: ((token: string) => void) | undefined
let rejectedToken = ''

export function setUnauthorizedHandler(handler: ((token: string) => void) | undefined) {
  unauthorizedHandler = handler
}

export function resetUnauthorizedState() { rejectedToken = '' }

async function request<T>(path: string, init: RequestInit, token?: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) controller.abort()
  const deadline = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 15_000)
  try {
    const response = await fetch(`/api/v1${path}`, { ...init, signal: controller.signal })
    const payload = await response.json().catch(() => null) as ApiEnvelope<T> | ApiFailure | null
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (response.status === 401 && token && rejectedToken !== token) {
      rejectedToken = token
      unauthorizedHandler?.(token)
    }
    if (!response.ok || !payload || !('data' in payload)) {
      throw new ApiRequestError(payload?.message ?? '请求失败，请稍后重试', response.status, payload?.requestId ?? response.headers.get('X-Request-Id') ?? undefined, payload?.code)
    }
    return payload.data
  } catch (reason) {
    if (reason instanceof ApiRequestError) throw reason
    if (controller.signal.aborted) {
      throw new ApiRequestError(timedOut ? '请求超时，请检查结果后重试。' : '请求已取消。', 0, undefined, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED')
    }
    throw new ApiRequestError('网络连接失败，请检查网络后重试。', 0, undefined, 'NETWORK_ERROR')
  } finally {
    clearTimeout(deadline)
    options.signal?.removeEventListener('abort', cancel)
  }
}

export async function apiGet<T>(path: string, token?: string, options?: ApiRequestOptions): Promise<T> {
  return request<T>(path, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }, token, options)
}

export async function apiRequest<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, token?: string, extraHeaders?: Record<string, string>, options?: ApiRequestOptions): Promise<T> {
  return request<T>(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, token, options)
}
