import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ExploreView from './ExploreView.vue'
import { useLocale } from '../stores/locale'

const apiGet = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ apiGet }))

const categories = [
  { id: 1, code: 'BRONZE', name: '青铜礼器' },
  { id: 2, code: 'JADE', name: '玉石意象' },
]
const artifacts = [
  { slug: 'river-map-jade-bi', title: '河图玉璧（概念展品）', categoryName: '玉石意象', categoryCode: 'JADE' },
  { slug: 'water-bird-bronze', title: '水鸟青铜雕塑（概念展品）', titleEn: 'Water-bird Bronze Sculpture (Concept)', summaryEn: 'An English summary from the API.', categoryName: '青铜礼器', categoryCode: 'BRONZE' },
  { slug: 'heluo-bronze-jue', title: '河洛纹青铜爵（概念展品）', categoryName: '青铜礼器', categoryCode: 'BRONZE' },
].map((item, id) => ({ ...item, id, summary: '馆藏叙事', period: '概念时期', material: '材质', coverImageUrl: '/fallback.webp' }))
const article = { id: 1, slug: 'how-to-read-bronze', title: '第一次看青铜器', summary: '从器形、纹样和用途开始。', categoryName: '青铜礼器', authorDisplay: '河洛数字博物馆', coverImageUrl: '/article.webp' }
const paged = (items: unknown[]) => ({ items, page: 1, size: 12, total: items.length, totalPages: 1 })

function respond(path: string) {
  if (path === '/categories') return categories
  if (path.startsWith('/articles')) return paged([article])
  if (path.startsWith('/search')) return paged([])
  const category = new URLSearchParams(path.split('?')[1]).get('categoryCode')
  return paged(category ? artifacts.filter(item => item.categoryCode === category) : artifacts)
}

beforeEach(() => {
  useLocale().locale.value = 'zh-CN'
  apiGet.mockReset().mockImplementation(async (path: string) => respond(path))
})
afterEach(() => { useLocale().locale.value = 'zh-CN' })

async function open(path = '/explore') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/explore', component: ExploreView },
      { path: '/artifacts/:slug', component: { template: '<div>Artifact</div>' } },
      { path: '/articles/:slug', component: { template: '<div>Article</div>' } },
      { path: '/exhibits', component: { template: '<div>Gallery</div>' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(ExploreView, { global: { plugins: [router], stubs: { PointerDotField: true } } })
  await flushPromises()
  return { wrapper, router }
}

describe('Explore gallery presentation and recovery', () => {
  it('opens directly into collection browsing with readable concept labels and real links', async () => {
    const { wrapper } = await open()
    expect(wrapper.get('h1').text()).toBe('探索馆藏')
    expect(wrapper.findAll('.gallery-object')).toHaveLength(3)
    const feature = wrapper.get('.gallery-object--featured')
    expect(feature.attributes('href')).toBe('/artifacts/water-bird-bronze')
    expect(feature.get('h3').text()).toBe('水鸟青铜雕塑')
    expect(feature.get('.gallery-object__meta').text()).toContain('概念展品')
    expect(feature.attributes('aria-label')).toContain('概念展品')
    expect(feature.get('img').attributes('fetchpriority')).toBe('high')
    expect(wrapper.get('.gallery-story').attributes('href')).toBe('/articles/how-to-read-bronze')
    wrapper.unmount()
  })

  it('filters the displayed objects and persists the selected theme in the URL', async () => {
    const { wrapper, router } = await open()
    await wrapper.get('.gallery-filters button:nth-child(2)').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ category: 'BRONZE' })
    expect(wrapper.findAll('.gallery-object')).toHaveLength(2)
    expect(wrapper.find('.gallery-object--featured').exists()).toBe(false)
    expect(wrapper.get('.gallery-filters button:nth-child(2)').attributes('aria-pressed')).toBe('true')
    expect(apiGet).toHaveBeenCalledWith('/artifacts?page=1&size=12&categoryCode=BRONZE')
    wrapper.unmount()
  })

  it('makes the thematic index navigate back to an existing collection heading', async () => {
    const { wrapper, router } = await open()
    await wrapper.get('.gallery-themes__links a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ category: 'BRONZE' })
    expect(router.currentRoute.value.hash).toBe('#collection-title')
    expect(wrapper.find('#collection-title').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps a failed image discoverable through its title and detail link', async () => {
    const { wrapper } = await open()
    const feature = wrapper.get('.gallery-object--featured')
    await feature.get('img').trigger('error')
    expect(feature.find('img').exists()).toBe(false)
    expect(feature.text()).toContain('图片暂不可用')
    expect(feature.get('h3').text()).toBe('水鸟青铜雕塑')
    expect(feature.attributes('href')).toBe('/artifacts/water-bird-bronze')
    wrapper.unmount()
  })

  it('shows a load failure exclusively and recovers with the retry action', async () => {
    apiGet.mockRejectedValueOnce(new Error('暂时无法连接'))
    const { wrapper } = await open()
    expect(wrapper.get('.collection-state--error').text()).toContain('暂时无法连接')
    expect(wrapper.find('.collection-state--empty').exists()).toBe(false)
    await wrapper.get('.collection-state--error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.collection-state--error').exists()).toBe(false)
    expect(wrapper.findAll('.gallery-object')).toHaveLength(3)
    wrapper.unmount()
  })

  it('offers a way back from an empty search without losing the search term', async () => {
    const { wrapper, router } = await open('/explore?q=不存在')
    expect(wrapper.get('input[type="search"]').element).toHaveProperty('value', '不存在')
    expect(wrapper.get('.collection-state--empty').text()).toContain('没有找到相关内容')
    await wrapper.get('.collection-state--empty button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.findAll('.gallery-object')).toHaveLength(3)
    wrapper.unmount()
  })

  it('retries the same failed search and restores editable controls', async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith('/search')) throw new Error('搜索服务暂不可用')
      return respond(path)
    })
    const { wrapper } = await open('/explore?q=青铜')
    expect(wrapper.get('.collection-state--error').text()).toContain('搜索服务暂不可用')
    expect(wrapper.find('.collection-state--empty').exists()).toBe(false)
    apiGet.mockImplementation(async (path: string) => path.startsWith('/search')
      ? paged([{ ...artifacts[1], type: 'artifact' }]) : respond(path))
    await wrapper.get('.collection-state--error button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.search-result-card')).toHaveLength(1)
    expect(wrapper.get('input').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.collection-state--error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('retains English object names, concept provenance and image geometry after a locale change', async () => {
    const { wrapper } = await open()
    const before = wrapper.get('.gallery-object--featured img').attributes('src')
    useLocale().locale.value = 'en-US'
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Explore the collection')
    expect(wrapper.get('.gallery-object--featured h3').text()).toBe('Water-bird Bronze Sculpture')
    expect(wrapper.get('.gallery-object--featured .gallery-object__meta').text()).toContain('Concept exhibit')
    expect(wrapper.get('.gallery-object--featured img').attributes('src')).toBe(before)
    expect(wrapper.get('input').attributes('aria-label')).toBe('Search artifacts or articles')
    wrapper.unmount()
  })

  it('shows an empty category independently from published articles and can clear it', async () => {
    const { wrapper, router } = await open('/explore?category=EMPTY')
    expect(wrapper.get('.gallery-browse .collection-state--empty').text()).toContain('暂时还没有已发布的器物')
    expect(wrapper.findAll('.gallery-story')).toHaveLength(1)
    await wrapper.get('.gallery-browse .collection-state--empty button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.findAll('.gallery-object')).toHaveLength(3)
    wrapper.unmount()
  })
})
