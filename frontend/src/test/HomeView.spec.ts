import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeView from '../views/HomeView.vue'

describe('HomeView', () => {
  it('shows the museum value proposition', () => {
    const pointerSurfaceMounted = vi.fn()
    const wrapper = mount(HomeView, {
      global: {
        directives: { pointerSurface: { mounted: pointerSurfaceMounted } },
        stubs: { RouterLink: true, ElButton: true },
      },
    })

    expect(wrapper.text()).toContain('让传统文化')
    expect(wrapper.text()).toContain('年轻文化探索者')
    expect(wrapper.text()).toContain('策展手记')
    expect(wrapper.text()).toContain('沿着河流阅读文明')
    expect(wrapper.find('.home-experiences').exists()).toBe(true)
    expect(pointerSurfaceMounted).not.toHaveBeenCalled()
  })
})

