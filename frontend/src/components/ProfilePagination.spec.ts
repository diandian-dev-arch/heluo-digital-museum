import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const apiGet = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ apiGet, apiRequest }))
import ProfileAppointments from './ProfileAppointments.vue'
import ProfileOrders from './ProfileOrders.vue'

describe('profile records beyond the first page', () => {
  beforeEach(() => { apiGet.mockReset(); apiRequest.mockReset(); localStorage.clear() })
  it('reaches appointment 21 and keeps page 2 after cancelling it', async () => {
    const item = { id: 21, appointmentNo: 'AP21', status: 'PENDING', visitorCount: 1, contactName: 'Visitor', visitDate: '2099-01-01', startTime: '09:00:00', endTime: '11:00:00' }
    apiGet.mockImplementation((path: string) => Promise.resolve({ items: [path.includes('page=2') ? item : { ...item, id: 1, appointmentNo: 'AP1' }], page: path.includes('page=2') ? 2 : 1, size: 20, total: 21, totalPages: 2 }))
    apiRequest.mockResolvedValue({})
    const wrapper = mount(ProfileAppointments, { props: { token: 'token' }, global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('21')
    await wrapper.get('[aria-label="下一页预约记录"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('AP21')
    await wrapper.get('.profile-record-actions button').trigger('click')
    await wrapper.get('.profile-record-actions button').trigger('click')
    await flushPromises()
    expect(apiGet.mock.calls.at(-1)?.[0]).toBe('/appointments/me?page=2&size=20')
  })
  it('reaches order 21 with its deadline and reconciles payment on the same page', async () => {
    const item = { id: 21, orderNo: 'OR21', status: 'PENDING_PAYMENT', payableAmount: '10.00', notificationEmail: 'test@example.test', expiresAt: '2099-01-01T09:15:00+08:00', items: [] }
    apiGet.mockImplementation((path: string) => Promise.resolve({ items: [{ ...item, orderNo: path.includes('page=2') ? 'OR21' : 'OR1' }], page: path.includes('page=2') ? 2 : 1, size: 20, total: 21, totalPages: 2 }))
    apiRequest.mockResolvedValue({ ...item, status: 'PAID' })
    const wrapper = mount(ProfileOrders, { props: { token: 'token' }, global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await wrapper.get('[aria-label="下一页订单记录"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('OR21')
    expect(wrapper.get('time').attributes('datetime')).toBe(item.expiresAt)
    await wrapper.get('.profile-record-actions button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已支付')
    expect(wrapper.get('[aria-current="page"]').text()).toContain('2')
  })
})
