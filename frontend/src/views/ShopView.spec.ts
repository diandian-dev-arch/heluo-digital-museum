import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CartPanelContent from '../components/CartPanelContent.vue'

const apiGet = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
  loggedIn: true,
  token: 'test-token',
  user: { id: 42, email: 'visitor@example.test' },
  initialize: vi.fn(),
}))

vi.mock('../lib/api', () => ({ apiGet, apiRequest: vi.fn() }))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))

import ShopView from './ShopView.vue'

describe('ShopView pending checkout recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    auth.initialize.mockReset()
    apiGet.mockReset()
  })

  it('restores a pending checkout even when the cart request fails', async () => {
    localStorage.setItem('heluo.pending-checkout.42', JSON.stringify({
      userId: 42,
      cartItemIds: [17],
      notificationEmail: 'visitor@example.test',
      checkoutKey: 'checkout-key',
      paymentKey: 'payment-key',
      order: { id: 8, orderNo: 'OR0008', payableAmount: 88 },
    }))
    apiGet.mockImplementation((path: string) => path === '/products'
      ? Promise.resolve([])
      : Promise.reject(new Error('购物袋暂时不可用')))

    const wrapper = mount(ShopView, {
      global: {
        directives: { pointerSurface: {} },
        stubs: { BottomSheet: true },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('购物袋暂时不可用')
    expect(wrapper.findComponent(CartPanelContent).props('pendingCheckout')).toBe(true)
    expect(wrapper.text()).toContain('订单待完成支付')
  })

  it('shows all products by default and returns to all products after filtering', async () => {
    apiGet.mockImplementation((path: string) => path === '/products'
      ? Promise.resolve([
          { id: 1, slug: 'river-line-teacup-set', name: '河流纹茶杯套装', summary: '茶杯', price: '89.00', availableStock: 9, coverImageUrl: '/tea.webp' },
          { id: 2, slug: 'heluo-silk-scarf', name: '河洛水系丝巾', summary: '丝巾', price: '129.00', availableStock: 8, coverImageUrl: '/scarf.webp' },
          { id: 3, slug: 'river-map-notebook', name: '河图纹笔记本', summary: '笔记本', price: '39.00', availableStock: 7, coverImageUrl: '/notebook.webp' },
        ])
      : Promise.resolve([]))

    const wrapper = mount(ShopView, {
      global: {
        directives: { pointerSurface: {} },
        stubs: { BottomSheet: true },
      },
    })
    await flushPromises()

    expect(wrapper.findAll('.product-grid article')).toHaveLength(3)
    const categoryButtons = wrapper.findAll('.shop-category-nav button')
    expect(categoryButtons[0].text()).toBe('全部文创')
    expect(categoryButtons[0].attributes('aria-pressed')).toBe('true')

    await categoryButtons[1].trigger('click')
    expect(wrapper.findAll('.product-grid article')).toHaveLength(1)

    await categoryButtons[0].trigger('click')
    expect(wrapper.findAll('.product-grid article')).toHaveLength(3)
  })
})
