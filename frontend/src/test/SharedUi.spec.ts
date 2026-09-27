import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FluidButton from '../components/FluidButton.vue'
import InlineStatus from '../components/InlineStatus.vue'
import StatusBadge from '../components/StatusBadge.vue'
import CartPanelContent from '../components/CartPanelContent.vue'
import BottomSheet from '../components/BottomSheet.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import AdminTabs from '../components/AdminTabs.vue'
import EditorialCard from '../components/EditorialCard.vue'
import MuseumSearchField from '../components/MuseumSearchField.vue'

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

  it('distinguishes an unread cart from an empty cart and keeps pending payment recovery available', async () => {
    const wrapper = mount(CartPanelContent, {
      props: { loggedIn: true, items: [], itemCount: 0, total: '0.00', email: '', checkoutState: 'idle', cartLoading: true },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.text()).toContain('正在加载购物袋')
    expect(wrapper.text()).not.toContain('购物袋还是空的')
    await wrapper.setProps({ cartLoading: false, cartLoadError: '网络不可用', error: '网络不可用', announceFeedback: true })
    expect(wrapper.get('[role="alert"]').text()).toContain('网络不可用')
    expect(wrapper.text()).not.toContain('购物袋还是空的')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('reload')).toHaveLength(1)
    await wrapper.setProps({ pendingCheckout: true, pendingOrder: { id: 7, orderNo: 'OR-7' } })
    expect(wrapper.text()).toContain('订单待完成支付')
    expect(wrapper.text()).not.toContain('购物袋暂时无法加载')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('checkout')).toHaveLength(1)
    await wrapper.setProps({ error: '', cartLoadError: '', pendingCheckout: false, pendingOrder: null })
    expect(wrapper.text()).toContain('购物袋还是空的')
    wrapper.unmount()
  })

  it('announces payment feedback inside a modal when it owns the active feedback', async () => {
    const wrapper = mount(CartPanelContent, {
      props: { loggedIn: true, items: [], itemCount: 0, total: '0.00', email: '', checkoutState: 'error', error: '支付待核对', announceFeedback: true },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.get('[role="alert"]').attributes('aria-hidden')).toBeUndefined()
    await wrapper.setProps({ error: '', message: '模拟支付成功', checkoutState: 'success' })
    expect(wrapper.get('[role="status"]').text()).toContain('模拟支付成功')
    wrapper.unmount()
  })

  it('exposes keyboard controls and dialog semantics on BottomSheet', async () => {
    const wrapper = mount(BottomSheet, { props: { open: true, title: '预约信息', snapPoint: 'medium' }, attachTo: document.body })
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.querySelector('button[aria-label="展开面板"]')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps reverse tab inside a newly opened sheet and restores the trigger', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const wrapper = mount(BottomSheet, { props: { open: false, title: '购物袋' }, attachTo: document.body })
    await wrapper.setProps({ open: true })
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!
    dialog.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }))
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(dialog)
    await wrapper.setProps({ open: false })
    expect(document.activeElement).toBe(trigger)
    wrapper.unmount()
    trigger.remove()
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

  it('emits search, clear and model updates from the shared museum search field', async () => {
    const wrapper = mount(MuseumSearchField, {
      props: { modelValue: '青铜', label: '搜索馆藏', placeholder: '输入关键词', submitLabel: '搜索' },
    })

    const input = wrapper.get('input[type="search"]')
    expect(input.attributes('aria-label')).toBe('搜索馆藏')
    expect(wrapper.get('form').attributes('data-glass')).toBeUndefined()
    expect(wrapper.get('.museum-search-field__control').attributes('data-glass')).toBe('compact')
    expect(wrapper.find('.museum-search-field__icon').exists()).toBe(false)
    await input.setValue('河流')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('.museum-search-field__clear').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['河流'], ['']])
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('exposes error and loading states on the shared museum search field', () => {
    const wrapper = mount(MuseumSearchField, {
      props: { modelValue: '', label: '搜索馆藏', loading: true, error: '搜索失败' },
    })

    expect(wrapper.get('form').attributes('data-state')).toBe('loading')
    expect(wrapper.get('input').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[role="alert"]').text()).toBe('搜索失败')
    expect(wrapper.get('.museum-search-field__submit').attributes('disabled')).toBeDefined()
  })

  it('uses caller-provided localized loading and clear labels', async () => {
    const wrapper = mount(MuseumSearchField, {
      props: { modelValue: 'bronze', label: 'Search artifacts', submitLabel: 'Search', loading: true, loadingLabel: 'Searching…', clearLabel: 'Clear search' },
    })

    expect(wrapper.get('.museum-search-field__submit').text()).toContain('Searching…')
    expect(wrapper.get('.museum-search-field__clear').attributes('aria-label')).toBe('Clear search')
  })

  it.each(['loading', 'disabled'] as const)('keeps the search query intact while %s', async (state) => {
    const wrapper = mount(MuseumSearchField, {
      props: { modelValue: '青铜', label: '搜索馆藏', [state]: true },
    })
    await wrapper.get('.museum-search-field__clear').trigger('click')
    expect(wrapper.emitted('clear')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ [state]: false })
    await wrapper.get('.museum-search-field__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  })

  it('renders the editorial card contract through semantic slots', () => {
    const wrapper = mount(EditorialCard, {
      props: { variant: 'artifact', index: 3, to: '/artifacts/bronze', mediaSrc: '/bronze.webp', mediaAlt: '青铜器' },
      slots: { meta: '青铜礼器', title: '河洛纹青铜爵', summary: '器物摘要', action: '查看详情' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })

    expect(wrapper.attributes('data-variant')).toBe('artifact')
    expect(wrapper.get('.editorial-card__index').text()).toBe('03')
    expect(wrapper.get('img').attributes('alt')).toBe('青铜器')
    expect(wrapper.get('.editorial-card__title').text()).toBe('河洛纹青铜爵')
    expect(wrapper.get('.editorial-card__action').text()).toBe('查看详情')
  })
})
