import { describe, expect, it, vi } from 'vitest'
import { createGsapContext, shouldRunGsapReveal } from './gsap'

describe('GSAP motion gates', () => {
  it('skips reveal in static tier and reduced-motion mode', () => {
    document.documentElement.dataset.motionTier = 'static'
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    expect(shouldRunGsapReveal()).toBe(false)

    document.documentElement.dataset.motionTier = 'full'
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    expect(shouldRunGsapReveal()).toBe(false)
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.motionTier
  })

  it('creates a scoped context and safely handles a missing root', () => {
    const root = document.createElement('main')
    document.body.append(root)
    const setup = vi.fn()
    const context = createGsapContext(root, setup)
    expect(setup).toHaveBeenCalledOnce()
    expect(context).toBeDefined()
    context?.revert()
    expect(createGsapContext(null, setup)).toBeUndefined()
    root.remove()
  })
})
