import { describe, expect, it } from 'vitest'
import { isReactive } from 'vue'
import { activePointerPositionSubscribers, usePointerMotion } from './usePointerMotion'

describe('usePointerMotion hot channel', () => {
  it('keeps RAF coordinates outside Vue reactivity', () => {
    const { pointer, position, updatePosition } = usePointerMotion()

    expect(isReactive(position)).toBe(false)
    updatePosition(120, 80, 240, -120)

    expect(position).toMatchObject({ clientX: 120, clientY: 80, velocityX: 240, velocityY: -120 })
    expect('clientX' in pointer).toBe(false)
  })

  it('notifies non-reactive subscribers and releases them explicitly', () => {
    const { subscribePosition, updatePosition } = usePointerMotion()
    let latestX = 0
    const stop = subscribePosition((position) => { latestX = position.clientX })

    expect(activePointerPositionSubscribers()).toBe(1)
    updatePosition(240, 160, 80, 40)
    expect(latestX).toBe(240)

    stop()
    expect(activePointerPositionSubscribers()).toBe(0)
  })
})
