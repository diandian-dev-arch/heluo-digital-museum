import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeMotionFrameSubscribers, subscribeMotionFrame } from './motionFrame'

describe('motion frame scheduler', () => {
  let nextId = 0
  let callbacks: Map<number, FrameRequestCallback>

  beforeEach(() => {
    callbacks = new Map()
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextId
      callbacks.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    expect(activeMotionFrameSubscribers()).toBe(0)
  })

  it('shares one frame loop and stops it when the final subscriber leaves', () => {
    const subscriber = vi.fn()
    const stop = subscribeMotionFrame(subscriber)
    expect(activeMotionFrameSubscribers()).toBe(1)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    const [id, callback] = [...callbacks.entries()][0]
    callbacks.delete(id)
    callback(16.67)
    expect(subscriber).toHaveBeenCalledWith(16.67, 16.67)

    stop()
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
