import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTE_TRANSITION_MS, routeScrollBehavior } from './index'

describe('route scroll behavior', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for the route exit animation before scrolling a new page to the top', async () => {
    vi.useFakeTimers()
    const result = routeScrollBehavior({ path: '/explore' } as never, { path: '/' } as never, null)

    await vi.advanceTimersByTimeAsync(ROUTE_TRANSITION_MS - 1)
    expect(await Promise.race([Promise.resolve(result).then(() => 'resolved'), Promise.resolve('pending')])).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toEqual({ left: 0, top: 0 })
  })

  it('restores the saved position after browser back navigation', async () => {
    vi.useFakeTimers()
    const savedPosition = { left: 0, top: 912 }
    const result = routeScrollBehavior({} as never, {} as never, savedPosition)

    await vi.advanceTimersByTimeAsync(ROUTE_TRANSITION_MS)
    await expect(Promise.resolve(result)).resolves.toEqual(savedPosition)
  })

  it('preserves scroll when a filter changes and offsets reading anchors', () => {
    expect(routeScrollBehavior({ path: '/explore' } as never, { path: '/explore' } as never, null)).toBe(false)
    expect(routeScrollBehavior({ hash: '#reading-section-2' } as never, {} as never, null)).toEqual({ el: '#reading-section-2', top: 96, behavior: 'auto' })
  })
})
