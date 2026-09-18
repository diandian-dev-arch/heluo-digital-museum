import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { activeMotionFrameSubscribers, subscribeMotionFrame } from '../lib/motionFrame'
import PointerCursor from './PointerCursor.vue'

const capabilityTier = ref<'full' | 'restrained' | 'static'>('full')
const downgradeForFps = vi.fn<(fps: number) => 'full' | 'restrained' | 'static'>()

vi.mock('../composables/usePointerCapabilities', () => ({
  usePointerCapabilities: () => ({
    tier: capabilityTier,
    reducedTransparency: ref(false),
    downgradeForFps,
  }),
}))

describe('PointerCursor', () => {
  let frameId = 0
  let frames = new Map<number, FrameRequestCallback>()

  beforeEach(() => {
    capabilityTier.value = 'full'
    downgradeForFps.mockReset()
    downgradeForFps.mockReturnValue('full')
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

  it('resynchronizes the dot after leaving the viewport and hides for keyboard input', async () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 120 }))
    expect(wrapper.get('.pointer-cursor__dot').attributes('style') ?? '').not.toContain('translate3d')
    runFrame(16)
    expect(wrapper.get('.pointer-cursor__dot').attributes('style')).toContain('translate3d(100px, 120px, 0)')

    window.dispatchEvent(new MouseEvent('pointerout', { relatedTarget: null }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 420 }))
    runFrame(32)
    expect(wrapper.get('.pointer-cursor__dot').attributes('style')).toContain('translate3d(700px, 420px, 0)')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await nextTick()
    expect(wrapper.find('.pointer-cursor').exists()).toBe(false)
    expect(document.documentElement.dataset.motionTier).toBe('static')

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 360, clientY: 260 }))
    await nextTick()
    runFrame(48)
    expect(wrapper.get('.pointer-cursor__dot').attributes('style')).toContain('translate3d(360px, 260px, 0)')
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

  it('does not restart the shared frame after an unmount with a queued check', async () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 220 }))
    expect(activeMotionFrameSubscribers()).toBe(1)

    wrapper.unmount()
    await nextTick()
    expect(activeMotionFrameSubscribers()).toBe(0)
  })

  it('lets the immediate core pull a lagging halo that settles and releases its frame', () => {
    const wrapper = mount(PointerCursor, { attachTo: document.body })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 120 }))
    runFrame(16)
    expect(wrapper.find('.pointer-cursor__halo').exists()).toBe(true)
    expect(wrapper.findAll('.pointer-cursor__dot')).toHaveLength(1)
    expect(wrapper.get('.pointer-cursor__dot').attributes('style')).toContain('translate3d(100px, 120px, 0)')

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 320, clientY: 120 }))
    runFrame(32)
    const halo = wrapper.get('.pointer-cursor__halo')
    expect(wrapper.get('.pointer-cursor__dot').attributes('style')).toContain('translate3d(320px, 120px, 0)')
    expect(halo.attributes('style')).not.toContain('translate3d(320px, 120px, 0)')
    expect(halo.attributes('data-pulling')).toBe('true')
    const stretch = Number(halo.attributes('style')?.match(/scaleX\(([\d.]+)\)/)?.[1])
    expect(stretch).toBeGreaterThan(1)
    expect(stretch).toBeLessThanOrEqual(1.06)

    for (let index = 3; index <= 80; index += 1) runFrame(index * 16)
    expect(halo.attributes('data-pulling')).toBe('false')
    expect(activeMotionFrameSubscribers()).toBe(0)
    wrapper.unmount()
  })

  it('keeps one bounded probe alive to confirm consecutive critical FPS windows', () => {
    downgradeForFps.mockReturnValueOnce('restrained').mockReturnValueOnce('static')
    const stopAmbientFrame = subscribeMotionFrame(() => {})
    const wrapper = mount(PointerCursor, { attachTo: document.body })

    for (let index = 1; index <= 20; index += 1) {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + index, clientY: 120 }))
      runFrame(index * 50)
    }
    stopAmbientFrame()

    expect(downgradeForFps).toHaveBeenCalledTimes(1)
    expect(activeMotionFrameSubscribers()).toBe(1)
    for (let index = 21; index <= 40; index += 1) runFrame(index * 50)
    expect(downgradeForFps).toHaveBeenCalledTimes(2)
    expect(activeMotionFrameSubscribers()).toBe(0)

    wrapper.unmount()
  })
})
