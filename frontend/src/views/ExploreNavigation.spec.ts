import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ExploreView from './ExploreView.vue'

const apiGet = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ apiGet }))
const result = (slug: string) => ({ type: 'artifact', slug, title: slug, summary: 'A collection object', coverImageUrl: '', categoryName: 'Bronze' })
const paged = (items: unknown[], total = items.length, totalPages = 1) => ({ items, page: 1, size: 24, total, totalPages })

beforeEach(() => {
  apiGet.mockReset().mockImplementation(async (path: string) => {
    if (path === '/categories') return [{ id: 1, code: 'BRONZE', name: '青铜礼器' }]
    if (path.startsWith('/search')) return path.includes('page=2') ? paged([result('object-25')], 25, 2) : paged(Array.from({ length: 24 }, (_, i) => result(`object-${i + 1}`)), 25, 2)
    return paged([])
  })
})
async function open(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/explore', component: ExploreView }] })
  await router.push(path)
  const wrapper = mount(ExploreView, { global: { plugins: [router], stubs: { PointerDotField: true, MuseumBrandSeal: true } } })
  await flushPromises()
  return { wrapper, router }
}

describe('collection URL navigation', () => {
  it.each(['/explore?category=BRONZE', '/explore?q=bronze&page=2'])('keeps the current URL and content on a blank submission from %s', async (path) => {
    const { wrapper, router } = await open(path)
    const results = wrapper.find('.collection-results')
    const before = results.exists() ? results.text() : ''
    const requests = apiGet.mock.calls.length
    await wrapper.get('input[type="search"]').setValue('   ')
    await wrapper.get('.gallery-search').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(path)
    expect(apiGet.mock.calls.length).toBe(requests)
    if (before) expect(wrapper.get('.collection-results').text()).toBe(before)
    wrapper.unmount()
  })

  it('loads a shared search URL and makes the 25th result accessible', async () => {
    const { wrapper, router } = await open('/explore?q=bronze')
    expect(wrapper.findAll('.search-result-card')).toHaveLength(24)
    expect(wrapper.text()).toContain('25 项')
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ q: 'bronze', page: '2' })
    expect(wrapper.findAll('.search-result-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('object-25')
    wrapper.unmount()
  })

  it('restores category and page from navigation without remounting', async () => {
    const { wrapper, router } = await open('/explore?category=BRONZE')
    expect(apiGet).toHaveBeenCalledWith('/artifacts?page=1&size=12&categoryCode=BRONZE')
    await router.push('/explore?q=bronze&page=2')
    await flushPromises()
    expect(wrapper.get('input[type="search"]').element).toHaveProperty('value', 'bronze')
    await wrapper.get('.collection-results .text-action').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.find('.collection-results').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores a late search response after navigation clears the search', async () => {
    let finish!: (value: unknown) => void
    apiGet.mockImplementation((path: string) => path.startsWith('/search')
      ? new Promise(resolve => { finish = resolve })
      : Promise.resolve(path === '/categories' ? [] : paged([])))
    const { wrapper, router } = await open('/explore?q=slow')
    await router.push('/explore')
    await flushPromises()
    finish(paged([result('stale')]))
    await flushPromises()
    expect(wrapper.find('.collection-results').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('stale')
    wrapper.unmount()
  })
})
