import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const setMode = vi.hoisted(() => vi.fn())
const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({
  slug: 'heluo-bronze-ding-3d',
  title: '三足青铜鼎',
  summary: '数字展项',
  description: '展项说明',
  modelUrl: '/ding.glb',
  modelFormat: 'GLB',
  modelSizeBytes: 1024,
  coverImageUrl: '/ding.webp',
  artifact: { slug: 'heluo-bronze-jue', title: '三足青铜鼎' },
}))

vi.mock('../lib/api', () => ({ apiGet }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'heluo-bronze-ding-3d' }, fullPath: '/exhibits/heluo-bronze-ding-3d' }),
  RouterLink: defineComponent({ props: ['to'], setup: (_, { slots }) => () => h('a', slots.default?.()) }),
}))

import ExhibitDetailView from './ExhibitDetailView.vue'

const viewerStub = defineComponent({
  name: 'ThreeExhibitViewer',
  emits: ['mode-change', 'quality-change'],
  setup(_, { expose }) {
    expose({ setMode, setView: vi.fn(), resetView: vi.fn(), rotate: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn() })
    return () => h('div', { class: 'viewer-stub' })
  },
})

describe('ExhibitDetailView point-cloud mode control', () => {
  it('uses the tour action to enter point cloud and return to the solid model', async () => {
    const wrapper = mount(ExhibitDetailView, {
      global: { stubs: { ThreeExhibitViewer: viewerStub, BottomSheet: true } },
    })
    await flushPromises()

    expect(wrapper.findAll('[data-motion="exhibit-tool"]')).toHaveLength(4)
    expect(wrapper.findAll('[data-motion="panel-fact"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-motion="dock-section"]')).toHaveLength(3)

    const tourAction = wrapper.get('.tour-route li:nth-child(5) button')
    expect(tourAction.text()).toBe('点云解构')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('solid')

    await tourAction.trigger('click')
    expect(setMode).toHaveBeenLastCalledWith('points')
    expect(tourAction.text()).toBe('返回实体模型')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('points')
    expect(wrapper.get('.dock-mode-switch button:first-child').text()).toContain('返回实体')

    await tourAction.trigger('click')
    expect(setMode).toHaveBeenLastCalledWith('solid')
    expect(tourAction.text()).toBe('点云解构')
    expect(wrapper.get('.dock-mode-switch').attributes('data-mode')).toBe('solid')
  })
})
