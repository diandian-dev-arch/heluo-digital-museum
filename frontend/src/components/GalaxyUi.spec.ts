import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AdminTabs from './AdminTabs.vue'
import FluidButton from './FluidButton.vue'
import GlassCheckbox from './GlassCheckbox.vue'

describe('Galaxy x Apple shared controls', () => {
  it('provides the unified fluid-button contract without changing its native semantics', () => {
    const wrapper = mount(FluidButton, { slots: { default: '开始探索' } })

    expect(wrapper.get('button').attributes('data-galaxy-button')).toBeDefined()
    expect(wrapper.get('.fluid-button__fill').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('button').attributes('type')).toBe('button')
  })

  it('emits a v-model update from the shared glass checkbox', async () => {
    const wrapper = mount(GlassCheckbox, {
      props: { id: 'visit-agreement', modelValue: false, label: '我已阅读参观提示' },
    })

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    expect(wrapper.find('[data-tactile-checkbox]').exists()).toBe(true)
    expect(wrapper.get('.glass-checkbox__label').text()).toBe('我已阅读参观提示')
  })

  it('keeps admin tabs as an accessible segmented control', async () => {
    const wrapper = mount(AdminTabs, {
      props: {
        modelValue: 'content',
        label: '管理内容类型',
        panelId: 'admin-panel',
        tabs: [
          { value: 'content', label: '内容' },
          { value: 'orders', label: '订单' },
        ],
      },
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(wrapper.get('[role="tablist"]').attributes('data-galaxy-segmented')).toBeDefined()
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['orders']])
  })
})
