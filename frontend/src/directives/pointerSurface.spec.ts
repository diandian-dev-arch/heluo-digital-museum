import type { DirectiveBinding, ObjectDirective } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeMotionFrameSubscribers } from '../lib/motionFrame'
import { POINTER_TIER_EVENT } from '../lib/pointerMotion'
import { pointerSurface, type PointerSurfaceOptions } from './pointerSurface'

describe('pointer surface directive', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motionTier
    expect(activeMotionFrameSubscribers()).toBe(0)
  })

  it('cleans listeners, frame subscription and inline state on unmount', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
    })
    document.documentElement.dataset.motionTier = 'full'
    const element = document.createElement('article')
    document.body.append(element)
    const directive = pointerSurface as ObjectDirective<HTMLElement, PointerSurfaceOptions>
    const binding = { value: { kind: 'collection' as const } } as DirectiveBinding<PointerSurfaceOptions>

    directive.mounted?.(element, binding, {} as never, null)
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 100, clientY: 50 }))
    expect(activeMotionFrameSubscribers()).toBe(1)
    expect(element.dataset.pointerActive).toBe('true')

    directive.unmounted?.(element, binding, {} as never, null)
    expect(element.style.transform).toBe('')
    expect(element.dataset.pointerSurface).toBeUndefined()
    expect(element.dataset.pointerSpotlight).toBeUndefined()
    expect(activeMotionFrameSubscribers()).toBe(0)
    element.remove()
    vi.restoreAllMocks()
  })

  it('only attaches pointer behavior in the full tier and clears it on downgrade', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
    })
    document.documentElement.dataset.motionTier = 'static'
    const element = document.createElement('article')
    document.body.append(element)
    const directive = pointerSurface as ObjectDirective<HTMLElement, PointerSurfaceOptions>
    const binding = { value: { kind: 'collection' as const } } as DirectiveBinding<PointerSurfaceOptions>
    directive.mounted?.(element, binding, {} as never, null)

    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 100, clientY: 50 }))
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(element.dataset.pointerActive).toBeUndefined()

    document.documentElement.dataset.motionTier = 'full'
    document.documentElement.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, { detail: { tier: 'full' } }))
    element.dispatchEvent(new MouseEvent('pointerenter', { clientX: 100, clientY: 50 }))
    expect(activeMotionFrameSubscribers()).toBe(1)
    expect(element.dataset.pointerActive).toBe('true')

    document.documentElement.dataset.motionTier = 'restrained'
    document.documentElement.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, { detail: { tier: 'restrained' } }))
    expect(activeMotionFrameSubscribers()).toBe(0)
    expect(element.dataset.pointerActive).toBeUndefined()
    expect(element.style.transform).toBe('')

    directive.unmounted?.(element, binding, {} as never, null)
    element.remove()
    vi.restoreAllMocks()
  })

  it('activates on the first move after upgrading from the static tier', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
    })
    document.documentElement.dataset.motionTier = 'static'
    const element = document.createElement('article')
    document.body.append(element)
    const directive = pointerSurface as ObjectDirective<HTMLElement, PointerSurfaceOptions>
    const binding = { value: { kind: 'collection' as const } } as DirectiveBinding<PointerSurfaceOptions>
    directive.mounted?.(element, binding, {} as never, null)

    document.documentElement.dataset.motionTier = 'full'
    document.documentElement.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, { detail: { tier: 'full' } }))
    element.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 50 }))

    expect(activeMotionFrameSubscribers()).toBe(1)
    expect(element.dataset.pointerActive).toBe('true')

    directive.unmounted?.(element, binding, {} as never, null)
    element.remove()
    vi.restoreAllMocks()
  })

  it('keeps only one surface marked active while moving between cards', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
    })
    document.documentElement.dataset.motionTier = 'full'
    const first = document.createElement('article')
    const second = document.createElement('article')
    document.body.append(first, second)
    const directive = pointerSurface as ObjectDirective<HTMLElement, PointerSurfaceOptions>
    const binding = { value: { kind: 'collection' as const } } as DirectiveBinding<PointerSurfaceOptions>
    directive.mounted?.(first, binding, {} as never, null)
    directive.mounted?.(second, binding, {} as never, null)

    first.dispatchEvent(new MouseEvent('pointerenter', { clientX: 40, clientY: 40 }))
    expect(first.dataset.pointerActive).toBe('true')
    expect(activeMotionFrameSubscribers()).toBe(1)
    second.dispatchEvent(new MouseEvent('pointerenter', { clientX: 140, clientY: 60 }))
    expect(first.dataset.pointerActive).toBeUndefined()
    expect(second.dataset.pointerActive).toBe('true')
    expect(activeMotionFrameSubscribers()).toBe(1)

    directive.unmounted?.(first, binding, {} as never, null)
    directive.unmounted?.(second, binding, {} as never, null)
    first.remove()
    second.remove()
    vi.restoreAllMocks()
  })
})
