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
})
