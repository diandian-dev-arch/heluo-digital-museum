import { defineComponent, h, onMounted } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setMode = vi.hoisted(() => vi.fn())
const recovery = vi.hoisted(() => ({ consume: vi.fn(() => false), reload: vi.fn() }))
const routeHarness = vi.hoisted(() => ({
  route: null as null | { params: { slug: string }; fullPath: string },
}))
const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({
  slug: 'heluo-bronze-ding-3d',
  title: '三足青铜鼎',
  summary: '数字展项',
  description: '展项说明',
  modelUrl: '/ding.glb',
  modelFormat: 'GLB',
  modelSizeBytes: 1024,
  mobileModelUrl: '/ding-mobile.glb',
  mobileModelSizeBytes: 837_720,
  coverImageUrl: '/ding.webp',
  artifact: { slug: 'heluo-bronze-jue', title: '三足青铜鼎' },
}))

vi.mock('../lib/api', () => ({ apiGet }))
vi.mock('../lib/exhibitRuntimeRecovery', () => ({ consumeExhibitRuntimeRecovery: recovery.consume, reloadExhibitRuntime: recovery.reload }))
vi.mock('vue-router', async () => {
  const { defineComponent: defineVueComponent, h: render, reactive } = await import('vue')
  routeHarness.route = reactive({ params: { slug: 'heluo-bronze-ding-3d' }, fullPath: '/exhibits/heluo-bronze-ding-3d' })
  return {
    useRoute: () => routeHarness.route,
    RouterLink: defineVueComponent({ props: ['to'], setup: (_, { slots }) => () => render('a', slots.default?.()) }),
  }
})

import ExhibitDetailView from './ExhibitDetailView.vue'

const viewerStub = defineComponent({
  name: 'ThreeExhibitViewer',
  props: { modelUrl: { type: String, required: true } },
  emits: ['mode-change', 'quality-change', 'state-change', 'point-cloud-state'],
  setup(props, { emit, expose }) {
    onMounted(() => emit('state-change', 'ready'))
    expose({
      setMode: (mode: 'solid' | 'points') => { setMode(mode); emit('mode-change', mode) },
      setView: vi.fn(), resetView: vi.fn(), rotate: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(),
    })
    return () => h('div', { class: 'viewer-stub', 'data-model-url': props.modelUrl })
  },
})

const pendingViewerStub = defineComponent({
  name: 'ThreeExhibitViewer',
  props: { modelUrl: { type: String, required: true } },
  setup: props => () => h('div', { class: 'viewer-stub', 'data-model-url': props.modelUrl }),
})

const exhibitFixture = {
  slug: 'heluo-bronze-ding-3d', title: '三足青铜鼎', summary: '数字展项', description: '展项说明',
  modelUrl: '/ding.glb', modelFormat: 'GLB', modelSizeBytes: 1024,
  mobileModelUrl: '/ding-mobile.glb', mobileModelSizeBytes: 837_720,
  coverImageUrl: '/ding.webp', artifact: { slug: 'heluo-bronze-jue', title: '三足青铜鼎' },
}

function mediaQuery(matches: (query: string) => boolean) {
  return vi.fn((query: string) => ({
    matches: matches(query), media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

describe('ExhibitDetailView point-cloud mode control', () => {
  beforeEach(() => {
    setMode.mockReset()
    recovery.consume.mockReset().mockReturnValue(false)
    recovery.reload.mockReset()
    apiGet.mockReset().mockResolvedValue(exhibitFixture)
    if (routeHarness.route) {
      routeHarness.route.params.slug = 'heluo-bronze-ding-3d'
      routeHarness.route.fullPath = '/exhibits/heluo-bronze-ding-3d'
    }
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: undefined })
    vi.stubGlobal('matchMedia', mediaQuery((query) => query === '(pointer: fine)' || query === '(hover: hover)'))
  })

  afterEach(() => {
    document.head.querySelectorAll('[data-heluo-three-model-preload]').forEach(link => link.remove())
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: undefined })
    vi.unstubAllGlobals()
  })

  it('uses the tour action to enter point cloud and return to the solid model', async () => {
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()

    expect(wrapper.findAll('[data-motion="exhibit-tool"]')).toHaveLength(4)
    expect(wrapper.findAll('[data-motion="panel-fact"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-motion="dock-section"]')).toHaveLength(3)

    const tourAction = wrapper.get('.tour-route li:nth-child(5) button')
    expect(tourAction.text()).toBe('点云讲解')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('solid')

    await tourAction.trigger('click')
    expect(setMode).toHaveBeenLastCalledWith('points')
    expect(tourAction.text()).toBe('返回实体模型')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('points')
    expect(wrapper.get('.dock-mode-switch button:first-child').text()).toContain('返回实体')

    await tourAction.trigger('click')
    expect(setMode).toHaveBeenLastCalledWith('solid')
    expect(tourAction.text()).toBe('点云讲解')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('solid')
    wrapper.unmount()
  })

  it('allows returning to solid while sampling and exposes point-cloud retry failures', async () => {
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()
    const runtime = wrapper.findComponent(viewerStub)
    runtime.vm.$emit('point-cloud-state', 'loading')
    await flushPromises()
    expect(wrapper.get('.dock-mode-switch button:last-child').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.dock-mode-switch button:first-child').attributes('disabled')).toBeUndefined()
    await wrapper.get('.dock-mode-switch button:first-child').trigger('click')
    expect(setMode).toHaveBeenLastCalledWith('solid')
    runtime.vm.$emit('point-cloud-state', 'error')
    await flushPromises()
    expect(wrapper.get('.render-quality').text()).toContain('点云暂时无法构建')
    expect(wrapper.get('.dock-mode-switch button:last-child').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps a coarse-pointer device on the poster and starts with the mobile model after consent', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    vi.stubGlobal('matchMedia', mediaQuery((query) => query === '(pointer: coarse)'))
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()

    expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('poster')
    expect(wrapper.find('.viewer-stub').exists()).toBe(false)
    expect(wrapper.get('.three-fallback').text()).toContain('模型体积：819 KB')
    expect(wrapper.get('.viewer-poster-start').text()).toBe('进入互动 3D')
    expect(wrapper.get('.viewer-poster-info').text()).toBe('查看展项信息')
    expect(wrapper.find('.mobile-exhibit-info-trigger').exists()).toBe(false)
    expect(document.head.querySelector('[data-heluo-three-model-preload]')).toBeNull()

    await wrapper.get('.viewer-poster-start').trigger('click')
    await flushPromises()
    expect(wrapper.get('.viewer-stub').attributes('data-model-url')).toBe('/ding-mobile.glb')
    expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('ready')
    expect(wrapper.get('.mobile-exhibit-info-trigger').text()).toBe('查看展项信息')
    expect(document.head.querySelector('[data-heluo-three-model-preload]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps a low-memory fine-pointer desktop on the poster and starts its lightweight model from the primary action', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1433 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 4 })
    vi.stubGlobal('matchMedia', mediaQuery((query) => query === '(pointer: fine)' || query === '(hover: hover)'))
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()

    expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('poster')
    expect(wrapper.find('.viewer-stub').exists()).toBe(false)
    expect(wrapper.get('.viewer-poster-start').text()).toBe('进入互动 3D')

    await wrapper.get('.viewer-poster-start').trigger('click')
    await flushPromises()

    expect(wrapper.get('.viewer-stub').attributes('data-model-url')).toBe('/ding-mobile.glb')
    expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('ready')
    wrapper.unmount()
  })

  it('resumes the requested mobile runtime once after a document reload', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    vi.stubGlobal('matchMedia', mediaQuery(query => query === '(pointer: coarse)'))
    recovery.consume.mockReturnValueOnce(true)
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()
    expect(wrapper.get('.viewer-stub').attributes('data-model-url')).toBe('/ding-mobile.glb')
    expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('ready')
    expect(recovery.reload).not.toHaveBeenCalled()
    wrapper.unmount()

    const nextVisit = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()
    expect(nextVisit.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('poster')
    expect(nextVisit.find('.viewer-stub').exists()).toBe(false)
    nextVisit.unmount()
  })

  it('keeps exhibit details available offline and reloads only after reconnecting', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    vi.stubGlobal('matchMedia', mediaQuery(query => query === '(pointer: coarse)'))
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    try {
      await flushPromises()
      await wrapper.get('.viewer-poster-start').trigger('click')
      expect(wrapper.get('.viewer-poster-copy').text()).toContain('网络已断开')
      expect(wrapper.find('.viewer-stub').exists()).toBe(false)
      expect(recovery.reload).not.toHaveBeenCalled()
      await wrapper.get('.viewer-poster-info').trigger('click')
      expect(wrapper.get('.viewer-poster-info').attributes('aria-expanded')).toBe('true')
      online.mockReturnValue(true)
      await wrapper.get('.viewer-poster-start').trigger('click')
      expect(recovery.reload).toHaveBeenCalledOnce()
      expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('activating')
    } finally {
      online.mockRestore()
      wrapper.unmount()
    }
  })

  it('opens mobile exhibit details from the poster action group without activating 3D', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    vi.stubGlobal('matchMedia', mediaQuery((query) => query === '(pointer: coarse)'))
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()

    const infoAction = wrapper.get('.viewer-poster-info')
    expect(infoAction.attributes('aria-expanded')).toBe('false')
    await infoAction.trigger('click')

    expect(infoAction.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.viewer-stub').exists()).toBe(false)
    expect(wrapper.get('.exhibit-viewer-wrap').attributes('data-viewer-state')).toBe('poster')
    wrapper.unmount()
  })

  it('preloads the selected mobile model only after consent and cleans the hint on unmount', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    vi.stubGlobal('matchMedia', mediaQuery((query) => query === '(pointer: coarse)'))
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: pendingViewerStub, BottomSheet: true } },
    })
    await flushPromises()

    expect(document.head.querySelector('[data-heluo-three-model-preload]')).toBeNull()
    await wrapper.get('.three-fallback button').trigger('click')
    await flushPromises()

    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[data-heluo-three-model-preload]')]
    expect(links).toHaveLength(1)
    expect(links[0].rel).toBe('preload')
    expect(links[0].as).toBe('fetch')
    expect(links[0].crossOrigin).toBe('anonymous')
    expect(links[0].href).toBe(new URL('/ding-mobile.glb', window.location.href).href)
    expect(wrapper.get('.viewer-stub').attributes('data-model-url')).toBe('/ding-mobile.glb')

    wrapper.unmount()
    expect(document.head.querySelector('[data-heluo-three-model-preload]')).toBeNull()
  })

  it('resets viewer mode and model selection when the route slug changes', async () => {
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()
    await wrapper.get('.tour-route li:nth-child(5) button').trigger('click')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('points')

    apiGet.mockResolvedValueOnce({ ...exhibitFixture, slug: 'jade-bi-3d', title: '玉璧', modelUrl: '/jade-bi.glb' })
    if (!routeHarness.route) throw new Error('Route harness is unavailable')
    routeHarness.route.params.slug = 'jade-bi-3d'
    routeHarness.route.fullPath = '/exhibits/jade-bi-3d'
    await flushPromises()

    expect(apiGet).toHaveBeenLastCalledWith('/exhibits/jade-bi-3d')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('solid')
    await vi.waitFor(() => expect(wrapper.get('.viewer-stub').attributes('data-model-url')).toBe('/jade-bi.glb'))
    wrapper.unmount()
  })
})
