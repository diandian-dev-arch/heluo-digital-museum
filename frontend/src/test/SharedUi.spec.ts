import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FluidButton from '../components/FluidButton.vue'
import InlineStatus from '../components/InlineStatus.vue'
import StatusBadge from '../components/StatusBadge.vue'
import CartPanelContent from '../components/CartPanelContent.vue'
import BottomSheet from '../components/BottomSheet.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import AdminTabs from '../components/AdminTabs.vue'

describe('shared visual controls', () => {
  it('exposes loading and variant state on FluidButton', () => {
    const wrapper = mount(FluidButton, { props: { loading: true, variant: 'danger', block: true }, slots: { default: '删除' } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.classes()).toContain('fluid-button--danger')
    expect(button.classes()).toContain('fluid-button--block')
  })

  it('uses alert semantics for errors', () => {
    const wrapper = mount(InlineStatus, { props: { kind: 'error', message: '保存失败' } })
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('保存失败')
    expect(alert.attributes('aria-live')).toBe('assertive')
    expect(alert.attributes('data-state')).toBe('error')
  })

  it('can render a visual status without creating a duplicate live region', () => {
    const wrapper = mount(InlineStatus, { props: { kind: 'success', message: '已加入购物袋', announce: false } })
    const status = wrapper.get('.inline-status')
    expect(status.text()).toContain('已加入购物袋')
    expect(status.attributes('role')).toBeUndefined()
    expect(status.attributes('aria-live')).toBeUndefined()
    expect(status.attributes('aria-hidden')).toBe('true')
  })

  it('exposes success and error states without changing the button contract', () => {
    const success = mount(FluidButton, { props: { state: 'success' }, slots: { default: '已保存' } })
    const error = mount(FluidButton, { props: { state: 'error' }, slots: { default: '重试' } })
    expect(success.get('button').attributes('data-state')).toBe('success')
    expect(success.text()).toContain('✓')
    expect(error.get('button').attributes('aria-invalid')).toBe('true')
  })

  it('maps backend states to a readable badge', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'PUBLISHED' } })
    expect(wrapper.text()).toContain('已发布')
    expect(wrapper.get('.status-badge').classes()).toContain('status-badge--positive')
  })

  it('keeps checkout validation inside a real email form', () => {
    const wrapper = mount(CartPanelContent, {
      props: {
        loggedIn: true,
        items: [{ id: 1, productId: 1, quantity: 1, name: '河流纹茶杯套装', price: '89.00', availableStock: 6, coverImageUrl: '/tea.webp' }],
        itemCount: 1,
        total: '89.00',
        email: '',
        checkoutState: 'idle',
      },
      global: { stubs: { RouterLink: true } },
    })
    const email = wrapper.get('input[type="email"]')
    expect(wrapper.find('form.cart-order-form').exists()).toBe(true)
    expect(email.attributes('required')).toBeDefined()
    expect(wrapper.find('button[aria-label="移除河流纹茶杯套装"]').exists()).toBe(true)
  })

  it('uses the catalog cover when a legacy cart item has a blank image', () => {
    const wrapper = mount(CartPanelContent, {
      props: {
        loggedIn: true,
        items: [{ id: 1, productId: 1, quantity: 1, name: '河图纹笔记本', slug: 'river-map-notebook', price: '39.00', availableStock: 6, coverImageUrl: '' }],
        itemCount: 1,
        total: '39.00',
        email: '',
        checkoutState: 'idle',
      },
      global: { stubs: { RouterLink: true } },
    })

    expect(wrapper.get('.cart-item img').attributes('src')).toBe('/media/products/river-map-notebook.webp')
  })

  it('keeps cart status copies visual-only so the page owns the live announcement', () => {
    const wrapper = mount(CartPanelContent, {
      props: {
        loggedIn: true,
        items: [],
        itemCount: 0,
        total: '0.00',
        email: '',
        checkoutState: 'success',
        message: '模拟支付成功',
      },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.text()).toContain('模拟支付成功')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('.inline-status').attributes('aria-hidden')).toBe('true')
  })

  it('offers an explicit retry for an order whose payment did not finish', async () => {
    const wrapper = mount(CartPanelContent, {
      props: {
        loggedIn: true,
        items: [],
        itemCount: 0,
        total: '0.00',
        email: 'buyer@example.test',
        checkoutState: 'error',
        pendingOrder: { id: 7, orderNo: 'OR20260803' },
        pendingCheckout: true,
      },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.text()).toContain('订单待完成支付')
    expect(wrapper.text()).toContain('OR20260803')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('checkout')).toHaveLength(1)
  })

  it('exposes keyboard controls and dialog semantics on BottomSheet', async () => {
    const wrapper = mount(BottomSheet, { props: { open: true, title: '预约信息', snapPoint: 'medium' }, attachTo: document.body })
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="展开面板"]')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('labels skeleton variants as live loading regions', () => {
    const wrapper = mount(LoadingSkeleton, { props: { variant: 'form', label: '正在加载表单' } })
    expect(wrapper.classes()).toContain('loading-skeleton--form')
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  it('connects admin tabs to their panel and supports arrow-key selection', async () => {
    const wrapper = mount(AdminTabs, {
      attachTo: document.body,
      props: {
        modelValue: 'artifacts',
        tabs: [
          { value: 'artifacts', label: '文物' },
          { value: 'articles', label: '文章' },
        ],
        label: '内容类型',
        panelId: 'admin-content-panel',
      },
    })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs[0]?.attributes('aria-controls')).toBe('admin-content-panel')
    expect(tabs[0]?.attributes('tabindex')).toBe('0')
    expect(tabs[1]?.attributes('tabindex')).toBe('-1')

    await tabs[0]?.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['articles'])
    expect(document.activeElement).toBe(tabs[1]?.element)
    wrapper.unmount()
  })
})
