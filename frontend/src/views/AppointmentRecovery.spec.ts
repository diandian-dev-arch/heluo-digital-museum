import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const apiGet = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ initialize: vi.fn(), loggedIn: true, token: 'token', user: { nickname: 'Default name', email: 'default@example.test' }, initializationError: '' }))
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('../lib/api', async () => ({ ...await vi.importActual('../lib/api'), apiGet, apiRequest }))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', async () => ({ ...await vi.importActual('vue-router'), useRouter: () => router }))
import AppointmentView from './AppointmentView.vue'
import { clearAppointmentDraft, readAppointmentDraft, saveAppointmentDraft } from '../stores/appointmentDraft'
const slot = { id: 10, visitDate: '2026-09-09', startTime: '09:00:00', endTime: '11:00:00', remainingPeople: 12 }
const render = () => mount(AppointmentView, { global: { stubs: { BottomSheet: true, PointerDotField: true, RouterLink: true } } })

describe('appointment recovery', () => {
  beforeEach(() => {
    clearAppointmentDraft(); vi.useRealTimers(); vi.setSystemTime(new Date('2026-09-08T06:00:00Z'))
    apiGet.mockReset().mockResolvedValue([slot]); apiRequest.mockReset(); router.push.mockReset(); auth.loggedIn = true; auth.initialize.mockResolvedValue(undefined)
  })
  it('keeps fields across a login detour and revalidates the selected slot', async () => {
    const first = render()
    await flushPromises()
    await first.get('.appointment-dates button:not(:disabled)').trigger('click')
    await first.get('input[autocomplete="name"]').setValue('Saved contact')
    await first.get('input[autocomplete="tel"]').setValue('13800138000')
    auth.loggedIn = false
    await first.get('form.appointment-details').trigger('submit')
    await flushPromises()
    expect(router.push).toHaveBeenCalledWith({ path: '/login', query: { returnTo: '/appointment' } })
    first.unmount()
    apiGet.mockResolvedValue([{ ...slot, remainingPeople: 0 }]); auth.loggedIn = true
    const restored = render()
    await flushPromises()
    expect((restored.get('input[autocomplete="name"]').element as HTMLInputElement).value).toBe('Saved contact')
    expect(restored.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(restored.text()).toContain('重新选择')
    restored.unmount()
  })
  it('keeps the slot chooser visible after submission failure and reuses its key', async () => {
    apiRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ appointmentNo: 'AP1' })
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.appointment-dates button:not(:disabled)').trigger('click')
    await wrapper.get('input[autocomplete="tel"]').setValue('13800138000')
    await wrapper.get('form.appointment-details').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.appointment-times').exists()).toBe(true)
    expect(wrapper.find('[data-submit-error]').exists()).toBe(true)
    expect(wrapper.get('input[autocomplete="name"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.visitor-stepper__input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.appointment-dates button.active').attributes('disabled')).toBeDefined()
    await wrapper.get('form.appointment-details').trigger('submit')
    await flushPromises()
    expect(apiRequest.mock.calls[1]?.[4]).toEqual(apiRequest.mock.calls[0]?.[4])
    expect(apiRequest.mock.calls[1]?.[2]).toEqual(apiRequest.mock.calls[0]?.[2])
    wrapper.unmount()
    const next = render()
    await flushPromises()
    expect((next.get('input[autocomplete="tel"]').element as HTMLInputElement).value).toBe('')
    next.unmount()
  })

  it('can recover an uncertain booking even after its time slot leaves the available list', async () => {
    saveAppointmentDraft({ ...readAppointmentDraft().form, slotId: 10, contactName: 'Owner', contactPhone: '13800138000', contactEmail: 'owner@example.test' }, 'original-key')
    apiGet.mockResolvedValue([])
    apiRequest.mockResolvedValue({ appointmentNo: 'RECOVERED' })
    const wrapper = render()
    await flushPromises()
    await wrapper.get('[data-recover-booking]').trigger('click')
    await flushPromises()
    expect(apiRequest.mock.calls[0]?.[4]).toEqual({ 'Idempotency-Key': 'original-key' })
    expect(wrapper.text()).toContain('RECOVERED')
    wrapper.unmount()
  })

  it('distinguishes full dates from unopened dates and selects only available times', async () => {
    apiGet.mockResolvedValue([
      { ...slot, id: 9, visitDate: '2026-09-08', remainingPeople: 0 },
      { ...slot, id: 10, remainingPeople: 0 },
      { ...slot, id: 11, startTime: '13:00:00', endTime: '15:00:00' },
    ])
    const wrapper = render()
    await flushPromises()
    const days = wrapper.findAll('.appointment-day')
    expect(days).toHaveLength(14)
    expect(days[0]!.text()).toContain('已约满')
    expect(days[0]!.attributes('disabled')).toBeDefined()
    expect(days[2]!.text()).toContain('未开放')
    expect(days[2]!.attributes('disabled')).toBeDefined()
    await days[1]!.trigger('click')
    const times = wrapper.findAll('.appointment-time')
    expect(times[0]!.attributes('disabled')).toBeDefined()
    expect(times[1]!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.appointment-summary').text()).toContain('13:00')
    await wrapper.get('.visitor-stepper__input').setValue(13)
    expect(wrapper.text()).toContain('当前时段余量不足')
    wrapper.unmount()
  })

  it('keeps all fourteen dates identifiable across a month boundary', async () => {
    vi.setSystemTime(new Date('2026-09-27T06:00:00Z'))
    apiGet.mockResolvedValue([{ ...slot, visitDate: '2026-10-01' }])
    const wrapper = render()
    await flushPromises()
    const days = wrapper.findAll('.appointment-day')
    expect(days[0]!.attributes('aria-label')).toContain('2026-09-27')
    expect(days[13]!.attributes('aria-label')).toContain('2026-10-10')
    await wrapper.get('[title="选择日期: 2026-10-01"]').trigger('click')
    expect(wrapper.get('.appointment-summary').text()).toContain('2026-10-01')
    wrapper.unmount()
  })
})
