import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { activeMotionFrameSubscribers } from '../lib/motionFrame'
import PointerCursor from './PointerCursor.vue'

const capabilityTier = ref<'full' | 'restrained' | 'static'>('full')

vi.mock('../composables/usePointerCapabilities', () => ({
  usePointerCapabilities: () => ({
    tier: capabilityTier,
    reducedTransparency: ref(false),
    downgradeForFps: vi.fn(),
  }),
}))

describe('PointerCursor', () => {
  let frameId = 0
  let frames = new Map<number, FrameRequestCallback>()

  beforeEach(() => {
    capabilityTier.value = 'full'
    frameId = 0
    frames = new Map()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameId += 1
      frames.set(frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  })

  afterEach(() => {
    document.documentElement.classList.remove('pointer-motion-enabled')
    delete document.documentElement.dataset.motionTier
    delete document.documentElement.dataset.reducedTransparency
    vi.unstubAllGlobals()
    expect(activeMotionFrameSubscribers()).toBe(0)
  })

  function runFrame(time: number) {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(time))
  }

  function dispatchPointer(type: string, pointerType: 'mouse' | 'pen' | 'touch', init: MouseEventInit = {}) {
    const event = new MouseEvent(type, init)
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    window.dispatchEvent(event)
  }

  it('resynchronizes the ring after leaving the viewport and hides for keyboard input', async () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 120 }))
    expect(wrapper.get('.pointer-cursor__ring').attributes('style') ?? '').not.toContain('translate3d')
    runFrame(16)
    expect(wrapper.get('.pointer-cursor__ring').attributes('style')).toContain('translate3d(100px, 120px, 0)')

    window.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 420 }))
    runFrame(32)
    expect(wrapper.get('.pointer-cursor__ring').attributes('style')).toContain('translate3d(700px, 420px, 0)')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await nextTick()
    expect(wrapper.find('.pointer-cursor').exists()).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('static')

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 360, clientY: 260 }))
    await nextTick()
    runFrame(48)
    expect(wrapper.get('.pointer-cursor__ring').attributes('style')).toContain('translate3d(360px, 260px, 0)')
    expect(document.documentElement.dataset.motionTier).toBe('full')

    wrapper.unmount()
  })

  it('reflects action and pressed states without intercepting the target', async () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body })
    const action = document.createElement('button')
    action.dataset.cursor = 'action'
    document.body.append(action)

    action.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 80, clientY: 90 }))
    await nextTick()
    expect(wrapper.get('.pointer-cursor').attributes('data-intent')).toBe('action')
    expect(wrapper.get('.pointer-cursor').classes()).toContain('is-visible')

    action.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper.get('.pointer-cursor').classes()).toContain('is-pressed')
    window.dispatchEvent(new MouseEvent('pointerup'))
    await nextTick()
    expect(wrapper.get('.pointer-cursor').classes()).not.toContain('is-pressed')

    action.remove()
    wrapper.unmount()
  })

  it('does not mount or hide the system cursor when disabled', async () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body, props: { disabled: true } })
    await nextTick()
    expect(wrapper.find('.pointer-cursor').exists()).toBe(false)
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('static')
    wrapper.unmount()
  })

  it('restores the system cursor immediately for pen and touch input on hybrid devices', async () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body })
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(true)

    dispatchPointer('pointermove', 'pen', { clientX: 120, clientY: 140 })
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('restrained')
    await nextTick()
    expect(wrapper.find('.pointer-cursor').exists()).toBe(false)
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('restrained')

    dispatchPointer('pointerdown', 'touch', { clientX: 160, clientY: 180 })
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('static')
    await nextTick()
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('static')

    dispatchPointer('pointermove', 'mouse', { clientX: 200, clientY: 220 })
    await nextTick()
    runFrame(16)
    expect(wrapper.get('.pointer-cursor').classes()).toContain('is-visible')
    expect(document.documentElement.classList.contains('pointer-motion-enabled')).toBe(true)

    wrapper.unmount()
  })
})
