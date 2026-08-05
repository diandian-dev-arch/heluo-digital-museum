import { describe, expect, it } from 'vitest'
import { isReactive } from 'vue'
import { usePointerMotion } from './usePointerMotion'

describe('usePointerMotion hot channel', () => {
  it('keeps RAF coordinates outside Vue reactivity', () => {
    const { pointer, position, updatePosition } = usePointerMotion()

    expect(isReactive(position)).toBe(false)
    updatePosition(120, 80, 240, -120)

    expect(position).toMatchObject({ clientX: 120, clientY: 80, velocityX: 240, velocityY: -120 })
    expect('clientX' in pointer).toBe(false)
  })
})
