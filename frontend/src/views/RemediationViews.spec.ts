import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiGet = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
  loggedIn: true,
  token: 'test-token',
  user: { id: 42, username: 'visitor', nickname: '测试访客', email: 'visitor@example.test', phone: '13800138000', roles: ['USER'] },
  isAdmin: false,
  initialize: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  updateProfile: vi.fn(),
  logout: vi.fn(),
}))
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
const route = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))

vi.mock('../lib/api', () => ({
  apiGet,
  apiRequest,
  ApiRequestError: class MockApiRequestError extends Error {
    status = 500
  },
}))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => auth,
  safeReturnTo: (value: unknown, fallback = '/profile') => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : fallback,
}))
vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, useRouter: () => router, useRoute: () => route }
})
vi.mock('element-plus/es/components/select/style/css', () => ({}))
vi.mock('element-plus/es/components/option/style/css', () => ({}))

import AdminContentView from './AdminContentView.vue'
import AdminOperationsView from './AdminOperationsView.vue'
import AppointmentView from './AppointmentView.vue'
import LoginView from './LoginView.vue'
import ProfileView from './ProfileView.vue'

const routerLinkStub = { template: '<a><slot /></a>' }

function contentPage<T>(items: T[]) {
  return { items, page: 1, size: 20, total: items.length, totalPages: 1 }
}

beforeEach(() => {
  apiGet.mockReset()
  apiRequest.mockReset()
  router.push.mockReset()
  router.replace.mockReset()
  auth.initialize.mockReset().mockResolvedValue(undefined)
  auth.login.mockReset()
  auth.register.mockReset()
  auth.updateProfile.mockReset()
  auth.logout.mockReset()
  auth.loggedIn = true
  auth.isAdmin = false
  auth.user = { id: 42, username: 'visitor', nickname: '测试访客', email: 'visitor@example.test', phone: '13800138000', roles: ['USER'] }
  route.query = {}
})

describe('remediation view behavior', () => {
  it('keeps the appointment idempotency key across a retry', async () => {
    const visitDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    apiGet.mockResolvedValue([{
      id: 101,
      visitDate,
      startTime: '09:00:00',
      endTime: '11:00:00',
      remainingPeople: 12,
    }])
    apiRequest.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({})

    const wrapper = mount(AppointmentView, {
      global: { stubs: { BottomSheet: true, PointerDotField: true, RouterLink: routerLinkStub } },
    })
    await flushPromises()

    await wrapper.get('.appointment-dates button:not(:disabled)').trigger('click')
    const form = wrapper.find('.appointment-details')
    await form.find('input[autocomplete="name"]').setValue('测试访客')
    await form.find('input[autocomplete="tel"]').setValue('13800138000')
    await form.find('input[autocomplete="email"]').setValue('visitor@example.test')
    await form.trigger('submit')
    await flushPromises()
    await form.trigger('submit')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledTimes(2)
    const firstHeaders = apiRequest.mock.calls[0]?.[4] as Record<string, string>
    const secondHeaders = apiRequest.mock.calls[1]?.[4] as Record<string, string>
    expect(firstHeaders['Idempotency-Key']).toBeTruthy()
    expect(secondHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key'])
    expect(wrapper.text()).toContain('预约已提交')
    wrapper.unmount()
  })

  it('keeps the visitor stepper within the supported range', async () => {
    apiGet.mockResolvedValue([{
      id: 101,
      visitDate: '2026-08-13',
      startTime: '09:00:00',
      endTime: '11:00:00',
      remainingPeople: 12,
    }])

    const wrapper = mount(AppointmentView, {
      global: { stubs: { BottomSheet: true, PointerDotField: true, RouterLink: routerLinkStub } },
    })
    await flushPromises()

    const stepper = wrapper.get('.appointment-quantity')
    const controls = stepper.findAll('button')
    const input = stepper.get('input[type="number"]')

    await input.setValue(1)
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('1')
    expect((controls[0]!.element as HTMLButtonElement).disabled).toBe(true)

    await controls[1]!.trigger('click')
    expect((input.element as HTMLInputElement).value).toBe('2')

    await input.setValue(31)
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('30')
    expect((controls[1]!.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('redirects a successful login to the safe internal return path', async () => {
    route.query = { returnTo: '/profile' }
    auth.login.mockResolvedValue(undefined)

    const wrapper = mount(LoginView, { global: { stubs: { RouterLink: routerLinkStub } } })
    const inputs = wrapper.findAll('form input')
    await inputs[0].setValue('visitor')
    await inputs[1].setValue('SafePassword123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.login).toHaveBeenCalledWith('visitor', 'SafePassword123')
    expect(router.push).toHaveBeenCalledWith('/profile')
  })

  it('saves profile fields and renders the appointment and order records', async () => {
    auth.updateProfile.mockResolvedValue({})

    const wrapper = mount(ProfileView, {
      global: {
        stubs: {
          RouterLink: routerLinkStub,
          ProfileAppointments: { template: '<div data-test="profile-appointments" />' },
          ProfileOrders: { template: '<div data-test="profile-orders" />' },
        },
      },
    })
    await flushPromises()

    const inputs = wrapper.findAll('form input')
    await inputs[0].setValue('新昵称')
    await inputs[1].setValue('new@example.test')
    await inputs[2].setValue('13900139000')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(auth.updateProfile).toHaveBeenCalledWith({ nickname: '新昵称', email: 'new@example.test', phone: '13900139000' })
    expect(wrapper.find('[data-test="profile-appointments"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="profile-orders"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('个人资料已保存')
  })

  it('retains a content form when the create request fails', async () => {
    auth.isAdmin = true
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes('/admin/categories')) return [{ id: 1, code: 'bronze', name: '青铜器' }]
      if (path.includes('/admin/artifacts')) return contentPage([{ id: 7, title: '既有文物', slug: 'existing-artifact', summary: '摘要', content: '正文', categoryId: 1, categoryName: '青铜器', status: 'DRAFT', deleted: false, coverImageUrl: '', updatedAt: '2026-08-11T00:00:00Z' }])
      if (path.includes('/admin/articles')) return contentPage([])
      if (path.includes('/admin/dashboard/summary')) return { userCount: 1, appointmentCount: 0, orderCount: 0, salesAmount: '0.00' }
      throw new Error(`unexpected GET: ${path}`)
    })
    apiRequest.mockRejectedValue(new Error('保存失败'))

    const wrapper = mount(AdminContentView, { global: { stubs: { RouterLink: routerLinkStub } } })
    await flushPromises()

    const form = wrapper.find('.admin-create form')
    const labels = form.findAll('label')
    const titleLabel = labels.find((label) => label.text().includes('标题'))
    const slugLabel = labels.find((label) => label.text().includes('URL 标识'))
    expect(titleLabel).toBeTruthy()
    expect(slugLabel).toBeTruthy()
    await titleLabel!.find('input').setValue('待保存文物')
    await slugLabel!.find('input').setValue('pending-artifact')
    await labels.find(label => label.text() === '摘要')!.get('textarea').setValue('摘要')
    await labels.find(label => label.text() === '正文')!.get('textarea').setValue('正文')
    await form.trigger('submit')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/admin/artifacts', 'POST', expect.objectContaining({ title: '待保存文物' }), 'test-token')
    expect(titleLabel!.find('input').element.value).toBe('待保存文物')
    expect(wrapper.text()).toContain('保存失败')
  })

  it('retains the admin user form when account creation fails', async () => {
    auth.isAdmin = true
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes('/admin/dashboard/summary')) return { userCount: 1, appointmentCount: 0, orderCount: 0, salesAmount: '0.00' }
      if (path.includes('/admin/users')) return contentPage([{ id: 8, username: 'member', nickname: '普通用户', email: '', status: 'ACTIVE', roles: ['USER'] }])
      throw new Error(`unexpected GET: ${path}`)
    })
    apiRequest.mockRejectedValue(new Error('用户创建失败'))

    const wrapper = mount(AdminOperationsView, { global: { stubs: { RouterLink: routerLinkStub } } })
    await flushPromises()

    const form = wrapper.find('.admin-inline-form')
    const inputs = form.findAll('input')
    await inputs[0].setValue('new_member')
    await inputs[1].setValue('SafePassword123')
    await inputs[2].setValue('新普通用户')
    await form.trigger('submit')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/admin/users', 'POST', expect.objectContaining({ username: 'new_member', nickname: '新普通用户' }), 'test-token')
    expect(inputs[0].element.value).toBe('new_member')
    expect(inputs[1].element.value).toBe('SafePassword123')
    expect(inputs[2].element.value).toBe('新普通用户')
    expect(wrapper.text()).toContain('用户创建失败')
  })

  it('requires confirmation before disabling a user', async () => {
    auth.isAdmin = true
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes('/admin/dashboard/summary')) return { userCount: 1, appointmentCount: 0, orderCount: 0, salesAmount: '0.00' }
      if (path.includes('/admin/users')) return contentPage([{ id: 8, username: 'member', nickname: '普通用户', email: '', status: 'ACTIVE', roles: ['USER'] }])
      throw new Error(`unexpected GET: ${path}`)
    })
    apiRequest.mockResolvedValue({})
    const confirmStub = { props: ['open', 'pending'], template: '<div v-if="open" data-test="confirm-dialog"><button data-test="confirm" type="button" @click="$emit(\'confirm\')">确认</button></div>', emits: ['confirm'] }
    const wrapper = mount(AdminOperationsView, { global: { stubs: { RouterLink: routerLinkStub, AdminConfirmDialog: confirmStub } } })
    await flushPromises()

    const disable = wrapper.findAll('button').find((button) => button.text() === '禁用')
    expect(disable).toBeTruthy()
    await disable!.trigger('click')
    await flushPromises()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="confirm-dialog"]').exists()).toBe(true)

    await wrapper.find('[data-test="confirm"]').trigger('click')
    await flushPromises()
    expect(apiRequest).toHaveBeenCalledWith('/admin/users/8/status', 'PATCH', { status: 'DISABLED' }, 'test-token')
  })

  it('locks every content action for the same record until its request settles', async () => {
    auth.isAdmin = true
    apiGet.mockImplementation(async (path: string) => {
      if (path.includes('/admin/categories')) return [{ id: 1, code: 'bronze', name: '青铜器' }]
      if (path.includes('/admin/artifacts')) return contentPage([{ id: 7, title: '既有文物', slug: 'existing-artifact', summary: '摘要', content: '正文', categoryId: 1, categoryName: '青铜器', status: 'DRAFT', deleted: false, coverImageUrl: '', updatedAt: '2026-08-11T00:00:00Z' }])
      if (path.includes('/admin/articles')) return contentPage([])
      if (path.includes('/admin/dashboard/summary')) return { userCount: 1, appointmentCount: 0, orderCount: 0, salesAmount: '0.00' }
      throw new Error(`unexpected GET: ${path}`)
    })
    let resolveRequest: (() => void) | undefined
    apiRequest.mockImplementation(() => new Promise<void>((resolve) => { resolveRequest = resolve }))
    const wrapper = mount(AdminContentView, { global: { stubs: { RouterLink: routerLinkStub } } })
    await flushPromises()

    const publish = wrapper.findAll('.admin-list--content article')[0]!.findAll('button').find((button) => button.text() === '发布')
    expect(publish).toBeTruthy()
    await publish!.trigger('click')
    await flushPromises()
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect((publish!.element as HTMLButtonElement).disabled).toBe(true)
    await publish!.trigger('click')
    expect(apiRequest).toHaveBeenCalledTimes(1)
    resolveRequest?.()
    await flushPromises()
    const refreshedPublish = wrapper.findAll('.admin-list--content article')[0]!.findAll('button').find((button) => button.text() === '发布')
    expect((refreshedPublish!.element as HTMLButtonElement).disabled).toBe(false)
  })
})
