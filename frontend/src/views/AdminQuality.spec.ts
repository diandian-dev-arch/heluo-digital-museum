import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { Component } from 'vue'

const apiGet = vi.hoisted(() => vi.fn())
const apiRequest = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ token: 'admin-token', isAdmin: true, loggedIn: true, user: { nickname: 'Admin', roles: ['ADMIN'] }, initialize: vi.fn(async () => {}) }))
vi.mock('../lib/api', () => ({ apiGet, apiRequest }))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('element-plus/es/components/select/style/css', () => ({}))
vi.mock('element-plus/es/components/option/style/css', () => ({}))

import AdminContentView from './AdminContentView.vue'
import AdminOperationsView from './AdminOperationsView.vue'

const summary = { userCount: 1, appointmentCount: 1, orderCount: 1, salesAmount: '20.00' }
const content = { id: 7, title: 'Existing artifact', slug: 'existing-artifact', categoryId: 1, categoryName: 'Bronze', summary: 'Summary', content: 'Content', status: 'DRAFT', deleted: false, coverImageUrl: '', updatedAt: '2026-09-08T00:00:00Z' }
const product = { id: 8, name: 'Bronze souvenir', sku: 'BRONZE', slug: 'bronze-item', summary: '', description: '', price: '20.00', stockQuantity: 5, lockedStock: 0, coverImageUrl: '', status: 'PUBLISHED', deleted: false }
function page<T>(items: T[], totalPages = 1) { return { items, totalPages, total: totalPages > 1 ? 41 : items.length, page: 1, size: 20 } }
function defaultGet(path: string): Promise<unknown> {
  if (path === '/admin/categories') return Promise.resolve([{ id: 1, code: 'bronze', name: 'Bronze' }])
  if (path === '/admin/dashboard/summary') return Promise.resolve(summary)
  if (path.startsWith('/admin/artifacts?')) return Promise.resolve(page([content], 3))
  if (path.startsWith('/admin/articles?')) return Promise.resolve(page([{ ...content, id: 9, title: 'Only article' }]))
  if (path.startsWith('/admin/users?')) return Promise.resolve(page([{ id: 1, username: 'visitor', nickname: 'Visitor Name', email: '', roles: ['USER'], status: 'ACTIVE' }]))
  if (path.startsWith('/admin/products?')) return Promise.resolve(page([product]))
  if (path.startsWith('/admin/orders?')) return Promise.resolve(page([{ id: 2, orderNo: 'ORDER-2', status: 'PAID', payableAmount: '20.00', notificationEmail: '', createdAt: '' }], 3))
  return Promise.resolve(page([]))
}
const wrappers: VueWrapper[] = []
async function view(component: Component) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin', component }, { path: '/elsewhere', component: { template: '<div>Elsewhere</div>' } },
  ] })
  await router.push('/admin'); await router.isReady()
  const wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router], stubs: {
    AdminShell: { template: '<div><slot name="header-actions"/><slot/></div>' },
    FluidButton: { props: ['disabled', 'loading', 'type'], template: '<button :type="type || \'button\'" :disabled="disabled || loading"><slot/></button>' },
    AdminActionButton: { props: ['disabled'], template: '<button type="button" :disabled="disabled"><slot/></button>' },
    ElSelect: { props: ['modelValue'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot/></select>' },
    ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  } } })
  wrappers.push(wrapper); await flushPromises(); return { wrapper, router }
}
async function selectTab(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('[role="tab"]').find(item => item.text() === label)
  expect(button).toBeTruthy(); await button!.trigger('click'); await flushPromises()
}
async function dialogChoice(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent === label)
  expect(button).toBeTruthy(); button!.click(); await flushPromises()
}
async function fillContent(wrapper: VueWrapper) {
  const form = wrapper.get('.admin-create form')
  const label = (text: string) => form.findAll('label').find(item => item.text().startsWith(text))!
  await label('标题').get('input').setValue('Unsaved content')
  await label('URL 标识').get('input').setValue('unsaved-content')
  await label('摘要').get('textarea').setValue('Summary')
  await label('正文').get('textarea').setValue('Content')
}

beforeEach(() => { apiGet.mockReset().mockImplementation(defaultGet); apiRequest.mockReset().mockResolvedValue({}); auth.initialize.mockClear() })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('admin quality workflows', () => {
  it('requires an artifact selection and keeps the exhibit draft on a failed save', async () => {
    const { wrapper } = await view(AdminOperationsView)
    await selectTab(wrapper, '3D 展项')
    const form = wrapper.get('.admin-inline-form')
    const label = (text: string) => wrapper.get('.admin-inline-form').findAll('label').find(item => item.text().startsWith(text))!
    await label('展项名称').get('input').setValue('New exhibit')
    await label('URL 标识').get('input').setValue('new-exhibit')
    await label('模型 Web 路径').get('input').setValue('/media/models/example.glb')
    await label('原创资产编号').get('input').setValue('example-model')
    // ElSelect renders a readonly input in the browser; native required validation
    // cannot establish that a real artifact has been selected.
    vi.spyOn(form.element as HTMLFormElement, 'reportValidity').mockReturnValue(true)
    await form.trigger('submit'); await flushPromises()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请选择关联文物后再创建展项。')
    expect((label('展项名称').get('input').element as HTMLInputElement).value).toBe('New exhibit')
    await label('关联文物').get('select').setValue('7')
    apiRequest.mockRejectedValueOnce(new Error('Save unavailable'))
    await form.trigger('submit'); await flushPromises()
    expect(apiRequest).toHaveBeenLastCalledWith('/admin/exhibits', 'POST', expect.objectContaining({ artifactId: 7, title: 'New exhibit' }), 'admin-token')
    expect((label('关联文物').get('select').element as HTMLSelectElement).value).toBe('7')
    expect(wrapper.text()).toContain('Save unavailable')
    await form.trigger('submit'); await flushPromises()
    expect((label('展项名称').get('input').element as HTMLInputElement).value).toBe('')
    expect((label('关联文物').get('select').element as HTMLSelectElement).value).toBe('')
  })

  it('uses the active content total and restores independent filter/page state', async () => {
    const { wrapper } = await view(AdminContentView)
    expect(wrapper.get('.admin-pagination').text()).toContain('1 / 3')
    await wrapper.get('.admin-list-filters input').setValue('bronze')
    await wrapper.get('.admin-list-filters input').trigger('keyup', { key: 'Enter' }); await flushPromises()
    await wrapper.get('.admin-pagination button:last-child').trigger('click'); await flushPromises()
    await selectTab(wrapper, '文章')
    expect(wrapper.find('.admin-pagination').exists()).toBe(false)
    expect((wrapper.get('.admin-list-filters input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('Only article')
    await selectTab(wrapper, '文物')
    expect(wrapper.get('.admin-pagination').text()).toContain('2 / 3')
    expect((wrapper.get('.admin-list-filters input').element as HTMLInputElement).value).toBe('bronze')
    expect(apiGet.mock.calls.filter(call => String(call[0]).startsWith('/admin/artifacts?')).at(-1)?.[0]).toContain('page=2')
  })

  it('ignores stale requests and isolates order/product status filters', async () => {
    let failOld: (reason: Error) => void = () => {}
    apiGet.mockImplementation(path => String(path).startsWith('/admin/users?') ? new Promise((_, reject) => { failOld = reject }) : defaultGet(path))
    const { wrapper } = await view(AdminOperationsView)
    await selectTab(wrapper, '订单')
    await wrapper.get('.admin-list-filters select').setValue('PAID'); await flushPromises()
    failOld(new Error('stale failure')); await flushPromises()
    expect(wrapper.text()).toContain('ORDER-2')
    expect(wrapper.text()).not.toContain('stale failure')
    await selectTab(wrapper, '商品')
    expect((wrapper.get('.admin-list-filters select').element as HTMLSelectElement).value).toBe('')
    expect(apiGet.mock.calls.filter(call => String(call[0]).startsWith('/admin/products?')).at(-1)?.[0]).not.toContain('PAID')
    await selectTab(wrapper, '订单')
    expect((wrapper.get('.admin-list-filters select').element as HTMLSelectElement).value).toBe('PAID')
    await wrapper.get('.admin-list-filters button').trigger('click'); await flushPromises()
    expect(apiGet.mock.calls.filter(call => String(call[0]).startsWith('/admin/orders?')).at(-1)?.[0]).not.toContain('status=')
  })

  it('protects new content on tabs, reload and navigation with save/discard/continue', async () => {
    const { wrapper, router } = await view(AdminContentView)
    await fillContent(wrapper)
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await selectTab(wrapper, '文章')
    await dialogChoice('继续编辑')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('文物')
    expect((wrapper.get('.admin-create input[maxlength="200"]').element as HTMLInputElement).value).toBe('Unsaved content')
    const navigation = router.push('/elsewhere'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/admin')
    await dialogChoice('放弃修改'); await navigation
    expect(router.currentRoute.value.path).toBe('/elsewhere')
  })

  it('retains draft and dialog on save failure then saves before switching tabs', async () => {
    const { wrapper } = await view(AdminContentView)
    await fillContent(wrapper)
    await selectTab(wrapper, '文章')
    apiRequest.mockRejectedValueOnce(new Error('Save unavailable'))
    await dialogChoice('保存并继续')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Save unavailable')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('文物')
    await dialogChoice('保存并继续')
    expect(apiRequest).toHaveBeenLastCalledWith('/admin/artifacts', 'POST', expect.objectContaining({ title: 'Unsaved content' }), 'admin-token')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('文章')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows a named operation consequence and preserves a failed user form', async () => {
    const { wrapper } = await view(AdminOperationsView)
    await wrapper.findAll('.admin-actions button').find(item => item.text() === '禁用')!.trigger('click')
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Visitor Name（@visitor）将无法登录')
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('/admin/users/')
    await dialogChoice('取消')
    const inputs = wrapper.findAll('.admin-inline-form input')
    await inputs[0]!.setValue('new_user'); await inputs[1]!.setValue('NewPassword123'); await inputs[2]!.setValue('New visitor')
    apiRequest.mockRejectedValueOnce(new Error('Create unavailable'))
    await wrapper.get('.admin-inline-form').trigger('submit'); await flushPromises()
    expect(wrapper.find('.admin-inline-form').exists()).toBe(true)
    expect((wrapper.findAll('.admin-inline-form input')[0]!.element as HTMLInputElement).value).toBe('new_user')
    await selectTab(wrapper, '商品'); await dialogChoice('继续编辑')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('用户')
    await selectTab(wrapper, '商品'); await dialogChoice('放弃修改')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('商品')
  })

  it('guards replacing an edit target and opening the recycle bin', async () => {
    const { wrapper } = await view(AdminContentView)
    await fillContent(wrapper)
    await wrapper.findAll('.admin-actions button').find(item => item.text() === '编辑')!.trigger('click'); await flushPromises()
    await dialogChoice('继续编辑')
    expect((wrapper.get('.admin-create input[maxlength="200"]').element as HTMLInputElement).value).toBe('Unsaved content')
    await wrapper.findAll('.admin-toolbar > button').find(item => item.text() === '查看回收站')!.trigger('click'); await flushPromises()
    await dialogChoice('放弃修改')
    expect(apiGet.mock.calls.filter(call => String(call[0]).startsWith('/admin/artifacts?')).at(-1)?.[0]).toContain('deleted=true')
    expect((wrapper.get('.admin-create input[maxlength="200"]').element as HTMLInputElement).value).toBe('')
  })

  it('saves an edited product before leaving its module', async () => {
    const { wrapper } = await view(AdminOperationsView)
    await selectTab(wrapper, '商品')
    await wrapper.findAll('.admin-actions button').find(item => item.text() === '编辑')!.trigger('click'); await flushPromises()
    await wrapper.findAll('.admin-product-edit input')[1]!.setValue('Renamed souvenir')
    await selectTab(wrapper, '订单')
    await dialogChoice('保存并继续')
    expect(apiRequest).toHaveBeenCalledWith('/admin/products/8', 'PATCH', expect.objectContaining({ name: 'Renamed souvenir', price: 20 }), 'admin-token')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('订单')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await selectTab(wrapper, '商品')
    expect(wrapper.find('.admin-product-edit').exists()).toBe(false)
  })
})
