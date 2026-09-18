import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CartPanelContent from '../components/CartPanelContent.vue'

const apiGet = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
  loggedIn: true,
  token: 'test-token',
  user: { id: 42, email: 'visitor@example.test' },
  initialize: vi.fn(),
}))

vi.mock('../lib/api', () => ({ apiGet, apiRequest }))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))

import ShopView from './ShopView.vue'

describe('ShopView pending checkout recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    auth.initialize.mockReset()
    apiGet.mockReset()
    apiRequest.mockReset()
  })

  it('serializes changes across rows and waits for them before checkout', async () => {
    const items = [1, 2].map(id => ({ id, productId: id, quantity: 1, name: `Item ${id}`, price: '10.00', availableStock: 9, coverImageUrl: '/tea.webp' }))
    apiGet.mockImplementation((path: string) => Promise.resolve(path === '/cart' ? items : []))
    let first!: (value: unknown) => void
    let second!: (value: unknown) => void
    apiRequest.mockImplementation((path: string) => {
      if (path === '/cart/items/1') return new Promise(resolve => { first = resolve })
      if (path === '/cart/items/2') return new Promise(resolve => { second = resolve })
      if (path === '/orders') return Promise.resolve({ id: 7, orderNo: 'OR7' })
      return Promise.resolve({})
    })
    const wrapper = mount(ShopView, { global: { directives: { pointerSurface: {} }, stubs: { BottomSheet: true, PointerDotField: true } } })
    await flushPromises()
    const panel = wrapper.findComponent(CartPanelContent)
    panel.vm.$emit('change', items[0], 2)
    panel.vm.$emit('change', items[1], 3)
    panel.vm.$emit('checkout')
    await flushPromises()
    expect(apiRequest.mock.calls.map(call => call[0])).toEqual(['/cart/items/1'])
    expect(panel.findAll('.cart-item button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    first([{ ...items[0], quantity: 2 }, items[1]])
    await flushPromises()
    expect(apiRequest.mock.calls.map(call => call[0])).toEqual(['/cart/items/1', '/cart/items/2'])
    second([{ ...items[0], quantity: 2 }, { ...items[1], quantity: 3 }])
    await flushPromises()
    expect(apiRequest.mock.calls.map(call => call[0])).toEqual(['/cart/items/1', '/cart/items/2', '/orders', '/orders/7/mock-payment'])
    expect(wrapper.text()).toContain('模拟支付成功')
    wrapper.unmount()
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
        stubs: { BottomSheet: true, PointerDotField: true },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('购物袋暂时不可用')
    expect(wrapper.findComponent(CartPanelContent).props('pendingCheckout')).toBe(true)
    expect(wrapper.text()).toContain('订单待完成支付')
  })

  it('reports success when a lost payment response reconciles to a paid order', async () => {
    const item = { id: 1, productId: 1, quantity: 1, name: 'Item', price: '10.00', availableStock: 9, coverImageUrl: '/tea.webp' }
    apiGet.mockImplementation((path: string) => Promise.resolve(path === '/cart' ? [item] : path === '/orders/7' ? { id: 7, orderNo: 'OR7', status: 'PAID' } : []))
    apiRequest.mockImplementation((path: string) => path === '/orders' ? Promise.resolve({ id: 7, orderNo: 'OR7' }) : Promise.reject(new Error('Network lost')))
    const wrapper = mount(ShopView, { global: { directives: { pointerSurface: {} }, stubs: { BottomSheet: true } } })
    await flushPromises()
    wrapper.findComponent(CartPanelContent).vm.$emit('checkout')
    await flushPromises()
    expect(wrapper.findComponent(CartPanelContent).props('checkoutState')).toBe('success')
    expect(wrapper.text()).toContain('模拟支付成功')
    expect(wrapper.text()).not.toContain('Network lost')
    expect(localStorage.getItem('heluo.pending-checkout.42')).toBeNull()
    expect(apiRequest.mock.calls.map(call => call[0])).toEqual(['/orders', '/orders/7/mock-payment'])
    wrapper.unmount()
  })

  it('finishes an initial cart read before a later add writes its response', async () => {
    const product = { id: 1, slug: 'river-line-teacup-set', name: 'Tea', summary: 'Tea', price: '10.00', availableStock: 9, coverImageUrl: '/tea.webp' }
    let finishRead!: (value: unknown) => void
    apiGet.mockImplementation((path: string) => path === '/cart' ? new Promise(resolve => { finishRead = resolve }) : Promise.resolve([product]))
    apiRequest.mockResolvedValue([{ ...product, productId: 1, quantity: 1 }])
    const wrapper = mount(ShopView, { global: { directives: { pointerSurface: {} }, stubs: { BottomSheet: true } } })
    await flushPromises()
    await wrapper.get('.product-copy button').trigger('click')
    await flushPromises()
    expect(apiRequest).not.toHaveBeenCalled()
    finishRead([])
    await flushPromises()
    expect(wrapper.findComponent(CartPanelContent).props('itemCount')).toBe(1)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    wrapper.unmount()
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
        stubs: { BottomSheet: true, PointerDotField: true },
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

  it('does not render an empty product stage when products fail to load', async () => {
    apiGet.mockImplementation((path: string) => path === '/products'
      ? Promise.reject(new Error('商品服务暂时不可用'))
      : Promise.resolve([]))

    const wrapper = mount(ShopView, {
      global: {
        directives: { pointerSurface: {} },
        stubs: { BottomSheet: true, PointerDotField: true },
      },
    })
    await flushPromises()

    expect(wrapper.find('.product-grid').exists()).toBe(false)
    expect(wrapper.find('.shop-products-state').exists()).toBe(true)
    expect(wrapper.find('.shop-products-state button').exists()).toBe(true)
  })
})
