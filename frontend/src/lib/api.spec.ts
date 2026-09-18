import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiRequest, resetUnauthorizedState, setUnauthorizedHandler } from './api'

describe('request recovery boundaries', () => {
  beforeEach(() => { resetUnauthorizedState(); vi.useFakeTimers() })
  afterEach(() => { setUnauthorizedHandler(undefined); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('cancels a stalled request after 15 seconds without replaying a write', async () => {
    const fetch = vi.fn((_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetch)
    const request = apiRequest('/orders', 'POST', {}).catch(error => error)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await request).toMatchObject({ status: 0, code: 'REQUEST_TIMEOUT' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('forwards caller cancellation and clears its deadline', async () => {
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const controller = new AbortController()
    const request = apiGet('/search', undefined, { signal: controller.signal }).catch(error => error)
    controller.abort()
    expect(await request).toMatchObject({ code: 'REQUEST_ABORTED' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports simultaneous authenticated 401 responses once and ignores 403', async () => {
    const expired = vi.fn()
    setUnauthorizedHandler(expired)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ message: 'Expired' }), { status: 401 }))))
    await Promise.allSettled([apiGet('/auth/me', 'old-token'), apiGet('/orders', 'old-token')])
    expect(expired).toHaveBeenCalledExactlyOnceWith('old-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    await apiGet('/admin', 'other-token').catch(() => undefined)
    expect(expired).toHaveBeenCalledTimes(1)
  })
})
