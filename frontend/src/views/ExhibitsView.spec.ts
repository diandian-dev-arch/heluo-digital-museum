import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gsap } from 'gsap'

const apiGet = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ apiGet }))

import ExhibitsView from './ExhibitsView.vue'

describe('ExhibitsView GSAP reveal', () => {
  beforeEach(() => {
    apiGet.mockReset()
    document.documentElement.dataset.motionTier = 'full'
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false })) })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete document.documentElement.dataset.motionTier
  })

  it('reveals ready cards through one scoped layered timeline', async () => {
    apiGet.mockResolvedValue([
      { slug: 'first', title: 'First', summary: 'Summary', coverImageUrl: '/first.webp', artifactSlug: 'artifact-first', artifactTitle: 'Artifact first' },
      { slug: 'second', title: 'Second', summary: 'Summary', coverImageUrl: '/second.webp', artifactSlug: 'artifact-second', artifactTitle: 'Artifact second' },
    ])
    const timeline = vi.spyOn(gsap, 'timeline')
    const wrapper = mount(ExhibitsView, {
      global: {
        directives: { pointerSurface: {} },
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })

    await flushPromises()
    await nextTick()
    expect(wrapper.findAll('[data-motion="item"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-motion="card-media"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-motion="card-copy"]')).toHaveLength(2)
    expect(timeline).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not create a tween for empty responses', async () => {
    apiGet.mockResolvedValue([])
    const timeline = vi.spyOn(gsap, 'timeline')
    const wrapper = mount(ExhibitsView, {
      global: {
        directives: { pointerSurface: {} },
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.state-panel').exists()).toBe(true)
    expect(timeline).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
