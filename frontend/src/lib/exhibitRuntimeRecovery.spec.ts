import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeExhibitRuntimeRecovery, reloadExhibitRuntime } from './exhibitRuntimeRecovery'

const key = 'heluo.exhibit-runtime-recovery'
const path = '/exhibits/heluo-bronze-ding-3d?source=gallery#details'
const values = new Map<string, string>()
const storage = {
  getItem: vi.fn((name: string) => values.get(name) ?? null),
  setItem: vi.fn((name: string, value: string) => { values.set(name, value) }),
  removeItem: vi.fn((name: string) => { values.delete(name) }),
}
const reload = vi.fn()

describe('exhibit runtime document recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T08:00:00Z'))
    values.clear()
    vi.clearAllMocks()
    vi.stubGlobal('window', {
      location: { pathname: '/exhibits/heluo-bronze-ding-3d', search: '?source=gallery', hash: '#details', reload },
      sessionStorage: storage,
    })
  })

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('reloads the current frame and resumes the same path exactly once', () => {
    reloadExhibitRuntime()
    expect(reload).toHaveBeenCalledOnce()
    expect(JSON.parse(values.get(key)!)).toEqual({ path, requestedAt: Date.now() })
    expect(consumeExhibitRuntimeRecovery()).toBe(true)
    expect(consumeExhibitRuntimeRecovery()).toBe(false)
    expect(values.has(key)).toBe(false)
  })

  it.each([
    ['different exhibit', JSON.stringify({ path: '/exhibits/another', requestedAt: new Date('2026-09-08T08:00:00Z').getTime() })],
    ['expired', JSON.stringify({ path, requestedAt: new Date('2026-09-08T07:57:59Z').getTime() })],
    ['future timestamp', JSON.stringify({ path, requestedAt: new Date('2026-09-08T08:01:00Z').getTime() })],
    ['invalid timestamp', JSON.stringify({ path, requestedAt: 'now' })],
    ['invalid JSON', '{broken'],
    ['null', 'null'],
  ])('does not automatically activate from %s recovery data', (_, saved) => {
    values.set(key, saved)
    expect(consumeExhibitRuntimeRecovery()).toBe(false)
    expect(values.has(key)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('still reloads if a private or embedded browser blocks session storage', () => {
    Object.defineProperty(window, 'sessionStorage', { get: () => { throw new DOMException('Blocked', 'SecurityError') } })
    expect(reloadExhibitRuntime).not.toThrow()
    expect(reload).toHaveBeenCalledOnce()
    expect(consumeExhibitRuntimeRecovery()).toBe(false)
  })
})
