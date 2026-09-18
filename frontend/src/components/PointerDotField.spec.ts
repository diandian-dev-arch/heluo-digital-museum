import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { activePointerPositionSubscribers, usePointerMotion } from '../composables/usePointerMotion'
import { activeMotionFrameSubscribers } from '../lib/motionFrame'
import { createDotFieldPoints } from '../lib/pointerDotField'
import { POINTER_TIER_EVENT } from '../lib/pointerMotion'
import PointerDotField from './PointerDotField.vue'

const capabilityTier = ref<'full' | 'restrained' | 'static'>('full')
const reducedTransparency = ref(false)

vi.mock('../composables/usePointerCapabilities', () => ({
  usePointerCapabilities: () => ({
    tier: capabilityTier,
    reducedTransparency,
    downgradeForFps: vi.fn(),
  }),
}))

vi.mock('../lib/pointerDotField', async () => {
  const actual = await vi.importActual<typeof import('../lib/pointerDotField')>('../lib/pointerDotField')
  return { ...actual, createDotFieldPoints: vi.fn(actual.createDotFieldPoints) }
})

describe('PointerDotField', () => {
  let nextFrameId = 0
  let frames: Map<number, FrameRequestCallback>
  let contextStub: CanvasRenderingContext2D

  beforeEach(() => {
    capabilityTier.value = 'full'
    reducedTransparency.value = false
    vi.mocked(createDotFieldPoints).mockClear()
    document.documentElement.dataset.motionTier = 'full'
    frames = new Map()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextFrameId
      frames.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 220, width: 360, height: 220, toJSON: () => ({}),
    })
    contextStub = {
      setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextStub)
  })

  afterEach(() => {
    usePointerMotion().setVisible(false)
    delete document.documentElement.dataset.motionTier
    delete document.documentElement.dataset.theme
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(activePointerPositionSubscribers()).toBe(0)
  })

  function runFrames(count: number) {
    for (let index = 1; index <= count; index += 1) {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(index * 16.67))
      if (!callbacks.length) break
    }
  }

  it('does not allocate a backing store or draw in static mode and initializes after full recovery', async () => {
    capabilityTier.value = 'static'
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    const canvas = wrapper.get('canvas').element as HTMLCanvasElement

    expect(wrapper.get('canvas').attributes('data-state')).toBe('disabled')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('none')
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
    expect(createDotFieldPoints).not.toHaveBeenCalled()
    expect(contextStub.clearRect).not.toHaveBeenCalled()
    expect(contextStub.fill).not.toHaveBeenCalled()
    expect(activePointerPositionSubscribers()).toBe(0)
    const componentSource = readFileSync(resolve(process.cwd(), 'src/components/PointerDotField.vue'), 'utf8')
    expect(componentSource).toContain('.pointer-dot-field[data-renderer="css"][data-palette="opaque"]')
    expect(componentSource).toContain('background-size: 27px 27px, 81px 81px;')

    capabilityTier.value = 'full'
    await nextTick()

    expect(wrapper.get('canvas').attributes('data-state')).toBe('idle')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('canvas')
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1)
    expect(createDotFieldPoints).toHaveBeenCalledTimes(1)
    expect(contextStub.clearRect).toHaveBeenCalledTimes(1)
    expect(activePointerPositionSubscribers()).toBe(1)
    wrapper.unmount()
  })

  it('uses a visible CSS dot field for fine-pointer reduced transparency without canvas work', async () => {
    reducedTransparency.value = true
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    const canvas = wrapper.get('canvas').element as HTMLCanvasElement

    expect(wrapper.get('canvas').attributes('data-state')).toBe('static')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('css')
    expect(wrapper.get('canvas').attributes('data-palette')).toBe('opaque')
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
    expect(createDotFieldPoints).not.toHaveBeenCalled()
    expect(contextStub.clearRect).not.toHaveBeenCalled()
    expect(contextStub.fill).not.toHaveBeenCalled()
    expect(activePointerPositionSubscribers()).toBe(0)

    reducedTransparency.value = false
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('canvas')
    expect(canvas.width).toBeGreaterThan(0)
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1)
    expect(createDotFieldPoints).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it.each(['paper', 'heading'] as const)('keeps %s waves responsive and releases frames after settling and leaving', async (variant) => {
    const wrapper = mount(PointerDotField, { attachTo: document.body, props: { variant } })
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('idle')
    expect(wrapper.get('canvas').attributes('data-effect')).toBe('luminous-point-wave')
    expect(wrapper.get('canvas').attributes('data-wave')).toBe('idle')
    expect(activePointerPositionSubscribers()).toBe(1)

    usePointerMotion().updatePosition(180, 110, 700, 0)
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('active')
    expect(wrapper.get('canvas').attributes('data-wave')).toBe('tracking')
    expect(activeMotionFrameSubscribers()).toBe(1)
    runFrames(140)
    if (variant === 'heading') expect(contextStub.createRadialGradient).not.toHaveBeenCalled()
    else expect(contextStub.createRadialGradient).toHaveBeenCalled()
    expect(contextStub.globalAlpha).toBe(1)
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(wrapper.get('canvas').attributes('data-state')).toBe('active')

    usePointerMotion().updatePosition(700, 500, 200, 0)
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('settling')
    expect(wrapper.get('canvas').attributes('data-wave')).toBe('idle')
    runFrames(320)
    await nextTick()
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(wrapper.get('canvas').attributes('data-state')).toBe('idle')
    wrapper.unmount()
  })

  it('disables for constrained tiers but keeps a still opaque field in reduced-transparency mode', async () => {
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    usePointerMotion().updatePosition(180, 110, 700, 0)
    await nextTick()
    expect(activeMotionFrameSubscribers()).toBe(1)

    capabilityTier.value = 'restrained'
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('disabled')
    expect((wrapper.get('canvas').element as HTMLCanvasElement).width).toBe(0)
    expect((wrapper.get('canvas').element as HTMLCanvasElement).height).toBe(0)
    expect(activeMotionFrameSubscribers()).toBe(0)

    capabilityTier.value = 'full'
    reducedTransparency.value = true
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('static')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('css')
    expect(wrapper.get('canvas').attributes('data-palette')).toBe('opaque')
    expect((wrapper.get('canvas').element as HTMLCanvasElement).width).toBe(0)
    expect(activeMotionFrameSubscribers()).toBe(0)
    const drawsWhileStatic = vi.mocked(contextStub.clearRect).mock.calls.length

    usePointerMotion().updatePosition(180, 110, 700, 0)
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('static')
    expect(wrapper.get('canvas').attributes('data-wave')).toBe('idle')
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(contextStub.clearRect).toHaveBeenCalledTimes(drawsWhileStatic)
    wrapper.unmount()
  })

  it('follows application tier events dispatched from the document root', async () => {
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    usePointerMotion().updatePosition(180, 110, 700, 0)
    await nextTick()
    expect(activeMotionFrameSubscribers()).toBe(1)

    document.documentElement.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, {
      detail: { tier: 'restrained' },
    }))
    await nextTick()
    const canvas = wrapper.get('canvas').element as HTMLCanvasElement
    expect(wrapper.get('canvas').attributes('data-state')).toBe('disabled')
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
    expect(activeMotionFrameSubscribers()).toBe(0)
    const drawsWhileDisabled = vi.mocked(contextStub.clearRect).mock.calls.length

    usePointerMotion().updatePosition(180, 110, 700, 0)
    await nextTick()
    expect(contextStub.clearRect).toHaveBeenCalledTimes(drawsWhileDisabled)

    document.documentElement.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, {
      detail: { tier: 'full' },
    }))
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('idle')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('canvas')
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(2)
    expect(createDotFieldPoints).toHaveBeenCalledTimes(2)
    expect(contextStub.clearRect).toHaveBeenCalledTimes(drawsWhileDisabled + 1)
    wrapper.unmount()
  })

  it('keeps the opaque field static when the application tier falls back', async () => {
    reducedTransparency.value = true
    capabilityTier.value = 'restrained'
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('static')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('css')
    expect(wrapper.get('canvas').attributes('data-palette')).toBe('opaque')
    expect((wrapper.get('canvas').element as HTMLCanvasElement).width).toBe(0)
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
    expect(createDotFieldPoints).not.toHaveBeenCalled()

    document.documentElement.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, {
      detail: { tier: 'static' },
    }))
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('static')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('css')
    expect(activeMotionFrameSubscribers()).toBe(0)
    wrapper.unmount()
  })

  it('does not render the opaque fallback when a motion accessibility constraint applies', async () => {
    reducedTransparency.value = true
    capabilityTier.value = 'static'
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    expect(wrapper.get('canvas').attributes('data-state')).toBe('disabled')
    expect(wrapper.get('canvas').attributes('data-renderer')).toBe('none')
    expect((wrapper.get('canvas').element as HTMLCanvasElement).width).toBe(0)
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
    expect(createDotFieldPoints).not.toHaveBeenCalled()
    expect(activeMotionFrameSubscribers()).toBe(0)
    wrapper.unmount()
  })

  it('tracks the document theme without changing the field geometry', async () => {
    document.documentElement.dataset.theme = 'dark'
    const wrapper = mount(PointerDotField, { attachTo: document.body })
    await nextTick()
    expect(contextStub.fillStyle).toBe('rgba(255, 202, 37, .98)')

    document.documentElement.dataset.theme = 'light'
    window.dispatchEvent(new CustomEvent('heluo:theme-change', { detail: 'light' }))
    await vi.waitFor(() => {
      expect(contextStub.fillStyle).toBe('rgba(255, 204, 20, .99)')
    })
    wrapper.unmount()
  })
})
