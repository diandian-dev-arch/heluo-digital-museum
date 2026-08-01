import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HomeView from '../views/HomeView.vue'

describe('HomeView', () => {
  it('shows the museum value proposition', () => {
    const wrapper = mount(HomeView, {
      global: { stubs: { RouterLink: true, ElButton: true } },
    })

    expect(wrapper.text()).toContain('传统文化')
    expect(wrapper.text()).toContain('年轻文化探索者')
  })
})

