<script setup lang="ts">
import '../assets/control-surface-polish.css'
import '../assets/public-responsive-polish.css'
import '../assets/explore-gallery.css'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Picture, Right, TopRight } from '@element-plus/icons-vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { apiGet, type ContentPage } from '../lib/api'
import { mediaSrcset, mediaSizes } from '../lib/responsiveMedia'
import { localizedContent } from '../lib/contentLocale'
import type { ArticleCard, ArtifactCard, Category, SearchResult } from '../lib/content'
import { useLocale } from '../stores/locale'
import EditorialCard from '../components/EditorialCard.vue'
import InlineStatus from '../components/InlineStatus.vue'
import MuseumSearchField from '../components/MuseumSearchField.vue'

const categories = ref<Category[]>([])
const route = useRoute()
const router = useRouter()
const artifacts = ref<ArtifactCard[]>([])
const articles = ref<ArticleCard[]>([])
const searchResults = ref<SearchResult[]>([])
const selectedCategory = ref('')
const keyword = ref('')
const submittedQuery = ref('')
const loading = ref(true)
const searching = ref(false)
const contentError = ref('')
const searchError = ref('')
const collectionPage = ref(1)
const artifactTotalPages = ref(1)
const articleTotalPages = ref(1)
const artifactTotal = ref(0)
const articleTotal = ref(0)
const searchTotal = ref(0)
const searchTotalPages = ref(1)
const { locale } = useLocale()
const failedImages = ref(new Set<string>())

const copy = computed(() => locale.value === 'en-US' ? {
  title: 'Explore the collection', intro: 'Objects, rituals and life along the river.',
  searchLabel: 'Search artifacts or articles', placeholder: 'Search the collection',
  searching: 'Searching...', search: 'Search', results: 'Search results for', items: 'items', finding: 'Finding content...',
  none: 'No matching content', emptyHint: 'Try another keyword or return to the collection.',
  artifact: 'Artifact', article: 'Article', read: 'Read details', all: 'All objects', filters: 'Collection themes',
  loading: 'Loading collection content...', retry: 'Try again', board: 'Collection objects', pieces: 'pieces', featured: 'Featured object',
  emptyExhibits: 'No published objects in this theme yet.', view: 'View object', backToAll: 'View all objects',
  stories: 'Further reading', articles: 'articles', emptyArticles: 'No published articles in this theme yet.', start: 'Read article',
  fallbackPeriod: 'Concept exhibit', fallbackAuthor: 'Heluo Digital Museum', previous: 'Previous page', next: 'Next page',
  pagination: 'Collection pages', clearSearch: 'Clear search', concept: 'Concept exhibit', imageUnavailable: 'Image unavailable',
  themes: 'Follow a theme', themesIntro: 'Ritual, nature and the memory of a place.', exhibitLink: 'Digital galleries',
  loadError: 'The collection could not be loaded. Try again.', searchFailed: 'Search could not be completed. Try again.'
  } : {
  title: '探索馆藏', intro: '器物里的礼序，河流中的日常。',
  searchLabel: '搜索文物或文章', placeholder: '搜索器物、纹样、故事',
  searching: '搜索中...', search: '搜索', results: '的搜索结果', items: '项', finding: '正在查找内容...',
  none: '没有找到相关内容', emptyHint: '换一个关键词，或回到全部馆藏继续浏览。',
  artifact: '文物', article: '文章', read: '阅读详情', all: '全部馆藏', filters: '馆藏主题',
  loading: '正在加载馆藏内容...', retry: '重新加载', board: '馆藏器物', pieces: '件', featured: '重点馆藏',
  emptyExhibits: '这个主题暂时还没有已发布的器物。', view: '查看器物', backToAll: '查看全部馆藏',
  stories: '延伸阅读', articles: '篇', emptyArticles: '这个主题暂时还没有已发布的文章。', start: '阅读文章',
  fallbackPeriod: '概念展品', fallbackAuthor: '河洛数字博物馆', previous: '上一页', next: '下一页',
  pagination: '馆藏分页', clearSearch: '清除搜索', concept: '概念展品', imageUnavailable: '图片暂不可用',
  themes: '循着主题，继续探索', themesIntro: '从礼器、自然，到一方水土的记忆。', exhibitLink: '进入数字展厅',
  loadError: '馆藏加载失败，请重试。', searchFailed: '搜索未能完成，请重试。'
  })

const categoryEnglish: Record<string, string> = { BRONZE: 'Bronze Rituals', JADE: 'Jade Imagery', RIVER: 'Heluo Stories', POTTERY: 'Pottery & Life', STONE: 'Stone Inscriptions' }
const artifactEnglish: Record<string, { period: string; material: string; category: string }> = {
  'water-bird-bronze': { period: 'Animal motif concept', material: 'Bronze', category: 'Bronze Rituals' },
  'heluo-bronze-jue': { period: 'Bronze Age concept', material: 'Bronze', category: 'Bronze Rituals' },
  'river-map-jade-bi': { period: 'Traditional jade ritual concept', material: 'Jade', category: 'Jade Imagery' },
  'painted-pottery-water-jar': { period: 'Prehistoric life concept', material: 'Pottery', category: 'Heluo Stories' },
  'river-map-pattern-stone': { period: 'Heluo symbol concept', material: 'Stone', category: 'Heluo Stories' },
}
const articleEnglish: Record<string, { category: string }> = {
  'why-negative-space-matters': { category: 'Jade Imagery' },
  'river-as-timeline': { category: 'Heluo Stories' },
  'how-to-read-bronze': { category: 'Bronze Rituals' },
}
const themeDescriptions = computed<Record<string, string>>(() => locale.value === 'en-US' ? {
  BRONZE: 'Form and pattern, cast into ritual.', JADE: 'A circle of stone, a world of meaning.', RIVER: 'Water, settlements and shared memory.',
} : {
  BRONZE: '以器形与纹样，读礼制之美。', JADE: '温润之间，见古人的天地观。', RIVER: '沿水而行，寻一方文明的来处。',
})
const conceptSuffix = /\s*(?:（概念展品）|\(Concept\))$/
const objectTitle = (artifact: ArtifactCard) => artifactCopy(artifact).title.replace(conceptSuffix, '')
const isConcept = (artifact: ArtifactCard) => conceptSuffix.test(artifactCopy(artifact).title)
const categoryName = (category: Pick<Category, 'code' | 'name'>) => locale.value === 'en-US' ? (categoryEnglish[category.code] ?? category.name) : category.name
const artifactCopy = (artifact: ArtifactCard) => ({ ...localizedContent(artifact, locale.value), ...(locale.value === 'en-US' && artifactEnglish[artifact.slug] ? { period: artifactEnglish[artifact.slug].period, material: artifactEnglish[artifact.slug].material, categoryName: artifactEnglish[artifact.slug].category } : {}) })
const articleCopy = (article: ArticleCard) => ({ ...localizedContent(article, locale.value), ...(locale.value === 'en-US' && articleEnglish[article.slug] ? { categoryName: articleEnglish[article.slug].category, authorDisplay: 'Heluo Digital Museum' } : {}) })
const searchCopy = (item: SearchResult) => {
  const localized = localizedContent(item, locale.value)
  if (locale.value !== 'en-US') return localized
  const category = item.type === 'artifact' ? artifactEnglish[item.slug]?.category : articleEnglish[item.slug]?.category
  return { ...localized, categoryName: category ?? item.categoryName }
}

const hasSubmittedSearch = computed(() => submittedQuery.value.length > 0)
const preferredOrder = ['water-bird-bronze', 'heluo-bronze-jue', 'river-map-jade-bi', 'painted-pottery-water-jar', 'river-map-pattern-stone']
// Explore uses one normalized editorial media set in both themes. The page
// changes its paper/ink surfaces, not the object framing, so switching theme
// cannot change the perceived scale or crop of a collection card.
const editorialArtifactMedia: Record<string, string> = {
  'heluo-bronze-ding': '/media/editorial/explore-bronze-ding-user-v2.webp',
  'water-bird-bronze': '/media/editorial/explore-water-bird-bronze-user-v2.webp',
  'heluo-bronze-jue': '/media/editorial/explore-bronze-jue-user-v2.webp',
  'river-map-jade-bi': '/media/editorial/explore-jade-bi-user-v2.webp',
  'painted-pottery-water-jar': '/media/editorial/explore-painted-pottery-jar-user-v2.webp',
  'river-map-pattern-stone': '/media/editorial/explore-river-map-stone-user-v2.webp',
}

const artifactCountLabel = (count: number) => locale.value === 'en-US'
  ? `${count} ${count === 1 ? 'piece' : 'pieces'}`
  : `${count} ${copy.value.pieces}`
const articleCountLabel = (count: number) => locale.value === 'en-US'
  ? `${count} ${count === 1 ? 'article' : 'articles'}`
  : `${count} ${copy.value.articles}`
const editorialArticleMedia: Record<string, string> = {
  'why-negative-space-matters': editorialArtifactMedia['river-map-jade-bi'],
  'river-as-timeline': editorialArtifactMedia['river-map-pattern-stone'],
  'how-to-read-bronze': editorialArtifactMedia['heluo-bronze-jue'],
}
const themeMedia: Record<string, string> = {
  BRONZE: editorialArtifactMedia['heluo-bronze-jue']!,
  JADE: editorialArtifactMedia['river-map-jade-bi']!,
  RIVER: editorialArtifactMedia['river-map-pattern-stone']!,
}
const displayArtifacts = computed(() => [...artifacts.value].sort((a, b) => {
  const ai = preferredOrder.indexOf(a.slug)
  const bi = preferredOrder.indexOf(b.slug)
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
}))
function artifactVisual(artifact: ArtifactCard) {
  return editorialArtifactMedia[artifact.slug] ?? artifact.coverImageUrl
}
function artifactMediaSizes() {
  const mobileWidth = locale.value === 'en-US' ? 'calc(100vw - 40px)' : 'calc(50vw - 28px)'
  return `(max-width: 520px) ${mobileWidth}, (max-width: 760px) calc(50vw - 28px), (max-width: 1100px) calc(50vw - 48px), (max-width: 1296px) calc((100vw - 160px) / 3), 379px`
}
function articleVisual(article: ArticleCard) {
  return editorialArticleMedia[article.slug] ?? article.coverImageUrl
}
function searchVisual(item: SearchResult) {
  if (item.type === 'artifact') return editorialArtifactMedia[item.slug] ?? item.coverImageUrl
  return editorialArticleMedia[item.slug] ?? item.coverImageUrl
}

let contentRequestId = 0
let searchRequestId = 0

const collectionTotalPages = computed(() => Math.max(artifactTotalPages.value, articleTotalPages.value))

async function loadContent(page = collectionPage.value) {
  const requestId = ++contentRequestId
  collectionPage.value = Math.max(1, page)
  loading.value = true
  contentError.value = ''
  try {
    const categoryQuery = selectedCategory.value ? `&categoryCode=${encodeURIComponent(selectedCategory.value)}` : ''
    const [categoryData, artifactData, articleData] = await Promise.all([
      apiGet<Category[]>('/categories'),
      apiGet<ContentPage<ArtifactCard>>(`/artifacts?page=${collectionPage.value}&size=12${categoryQuery}`),
      apiGet<ContentPage<ArticleCard>>(`/articles?page=${collectionPage.value}&size=12${categoryQuery}`),
    ])
    if (requestId === contentRequestId) {
      categories.value = categoryData
      artifacts.value = artifactData.items
      articles.value = articleData.items
      artifactTotalPages.value = Math.max(1, artifactData.totalPages)
      articleTotalPages.value = Math.max(1, articleData.totalPages)
      artifactTotal.value = artifactData.total
      articleTotal.value = articleData.total
      if (collectionPage.value > collectionTotalPages.value) {
        void router.replace({ query: { ...route.query, page: String(collectionTotalPages.value) } })
      }
    }
  } catch (reason) {
    if (requestId === contentRequestId) contentError.value = reason instanceof Error ? reason.message : copy.value.loadError
  } finally {
    if (requestId === contentRequestId) loading.value = false
  }
}

async function loadSearch() {
  const query = submittedQuery.value
  const requestId = ++searchRequestId
  submittedQuery.value = query
  searchResults.value = []
  searching.value = true
  searchError.value = ''
  try {
    const result = await apiGet<ContentPage<SearchResult>>(`/search?keyword=${encodeURIComponent(query)}&type=all&page=${collectionPage.value}&size=24`)
    if (requestId === searchRequestId) {
      searchResults.value = result.items
      searchTotal.value = result.total
      searchTotalPages.value = Math.max(1, result.totalPages)
      if (collectionPage.value > searchTotalPages.value) void router.replace({ query: { ...route.query, page: String(searchTotalPages.value) } })
    }
  } catch (reason) {
    if (requestId === searchRequestId) searchError.value = reason instanceof Error ? reason.message : copy.value.searchFailed
  } finally {
    if (requestId === searchRequestId) searching.value = false
  }
}

function retryContent() { void loadContent(collectionPage.value) }

function resetSearchState() {
  searchRequestId += 1
  submittedQuery.value = ''
  searchResults.value = []
  searching.value = false
  searchError.value = ''
}
function runSearch() {
  const query = keyword.value.trim()
  if (!query) return
  if (query === submittedQuery.value && collectionPage.value === 1) { void loadSearch(); return }
  void router.push({ query: { q: query } })
}
function clearSearch() {
  keyword.value = ''
  resetSearchState()
  void router.push({ query: selectedCategory.value ? { category: selectedCategory.value } : {} })
}
function selectCategory(category: string) {
  void router.push({ query: category ? { category } : {} })
}
function showAllCollection() {
  void router.push({ query: {} })
}
function goToCollectionPage(page: number) {
  const lastPage = hasSubmittedSearch.value ? searchTotalPages.value : collectionTotalPages.value
  if (page < 1 || page > lastPage || page === collectionPage.value) return
  void router.push({ query: { ...route.query, page: page === 1 ? undefined : String(page) } })
}
function syncQuery() {
  contentRequestId += 1
  resetSearchState()
  const q = typeof route.query.q === 'string' ? route.query.q.trim() : ''
  const page = Number(route.query.page)
  keyword.value = q
  submittedQuery.value = q
  selectedCategory.value = typeof route.query.category === 'string' ? route.query.category : ''
  collectionPage.value = Number.isSafeInteger(page) && page > 0 ? page : 1
  if (q) void loadSearch()
  else void loadContent()
}
watch(() => route.query, syncQuery, { immediate: true })
onBeforeUnmount(() => {
  contentRequestId += 1
  searchRequestId += 1
})
</script>

<template>
  <section id="explore-gallery" class="collection-page collection-gallery">
    <header class="gallery-intro" aria-labelledby="collection-title">
      <div class="gallery-intro__copy">
        <h1 id="collection-title">{{ copy.title }}</h1>
        <p class="gallery-intro__description">{{ copy.intro }}</p>
      </div>
      <MuseumSearchField
        v-model="keyword"
        class="gallery-search"
        :label="copy.searchLabel"
        :placeholder="copy.placeholder"
        :submit-label="copy.search"
        :loading-label="copy.searching"
        :clear-label="copy.clearSearch"
        :loading="searching"
        :error="searchError"
        @submit="runSearch"
        @clear="clearSearch"
      />
    </header>

    <section v-if="hasSubmittedSearch" id="collection-search-results" class="collection-results gallery-results" aria-live="polite" :aria-busy="searching">
      <header class="gallery-section-head">
        <div>
          <h2>{{ locale === 'en-US' ? `${copy.results} “${submittedQuery}”` : `“${submittedQuery}”${copy.results}` }}</h2>
          <p v-if="!searching && !searchError">{{ searchTotal }} {{ copy.items }}</p>
        </div>
        <button class="text-action gallery-text-link" type="button" @click="clearSearch">{{ copy.clearSearch }}<Right aria-hidden="true" /></button>
      </header>
      <div v-if="searching" class="collection-loading gallery-skeleton" role="status">
        <span class="sr-only">{{ copy.finding }}</span>
        <div v-for="index in 3" :key="index" class="gallery-skeleton__item" aria-hidden="true"><span /><span /><span /></div>
      </div>
      <div v-else-if="searchError" class="collection-state collection-state--error gallery-state">
        <InlineStatus kind="error" :message="searchError" />
        <button class="gallery-text-link" type="button" @click="runSearch">{{ copy.retry }}<Right aria-hidden="true" /></button>
      </div>
      <div v-else-if="searchResults.length === 0" class="collection-state collection-state--empty gallery-state">
        <h3>{{ copy.none }}</h3>
        <p>{{ copy.emptyHint }}</p>
        <button class="gallery-text-link" type="button" @click="clearSearch">{{ copy.backToAll }}<Right aria-hidden="true" /></button>
      </div>
      <div v-else class="gallery-result-grid">
        <EditorialCard
          v-for="item in searchResults"
          :key="`${item.type}-${item.slug}`"
          class="search-result-card gallery-result-card"
          :class="{ 'gallery-result-card--artifact': item.type === 'artifact' }"
          :variant="item.type"
          :to="`/${item.type === 'artifact' ? 'artifacts' : 'articles'}/${item.slug}`"
          :media-src="searchVisual(item)"
          media-alt=""
        >
          <template #media>
            <img v-if="searchVisual(item) && !failedImages.has(searchVisual(item))" :src="searchVisual(item)" :srcset="mediaSrcset(searchVisual(item))" :sizes="mediaSizes" alt="" loading="lazy" decoding="async" @error="failedImages.add(searchVisual(item))" />
            <span v-else class="gallery-image-fallback"><Picture aria-hidden="true" />{{ copy.imageUnavailable }}</span>
          </template>
          <template #meta>{{ item.type === 'artifact' ? copy.artifact : copy.article }} · {{ searchCopy(item).categoryName }}<span v-if="item.type === 'artifact' && item.slug === 'heluo-bronze-ding'"> · {{ locale === 'en-US' ? 'AI editorial image' : 'AI策展配图' }}</span></template>
          <template #title>{{ searchCopy(item).title }}</template>
          <template #summary><p>{{ searchCopy(item).summary }}</p></template>
          <template #action>{{ copy.read }}<Right aria-hidden="true" /></template>
        </EditorialCard>
      </div>
      <nav v-if="!searching && !searchError && searchTotalPages > 1" class="collection-pagination gallery-pagination" :aria-label="copy.pagination">
        <button type="button" :aria-label="copy.previous" :disabled="collectionPage === 1" @click="goToCollectionPage(collectionPage - 1)"><ArrowLeft aria-hidden="true" /></button>
        <span>{{ collectionPage }} / {{ searchTotalPages }}</span>
        <button type="button" :aria-label="copy.next" :disabled="collectionPage === searchTotalPages" @click="goToCollectionPage(collectionPage + 1)"><ArrowRight aria-hidden="true" /></button>
      </nav>
    </section>

    <template v-else>
      <div class="gallery-toolbar">
        <nav class="collection-filters gallery-filters" :aria-label="copy.filters">
          <button :class="{ active: selectedCategory === '' }" type="button" :aria-pressed="selectedCategory === ''" @click="selectCategory('')">{{ copy.all }}</button>
          <button v-for="category in categories" :key="category.code" :class="{ active: selectedCategory === category.code }" type="button" :aria-pressed="selectedCategory === category.code" @click="selectCategory(category.code)">{{ categoryName(category) }}</button>
        </nav>
        <RouterLink class="gallery-text-link gallery-exhibit-link" to="/exhibits">{{ copy.exhibitLink }}<TopRight aria-hidden="true" /></RouterLink>
      </div>

      <section v-if="loading" class="collection-loading gallery-skeleton" role="status" :aria-label="copy.loading">
        <span class="sr-only">{{ copy.loading }}</span>
        <div v-for="index in 6" :key="index" class="gallery-skeleton__item" aria-hidden="true"><span /><span /><span /></div>
      </section>
      <section v-else-if="contentError" class="collection-state collection-state--error gallery-state">
        <InlineStatus kind="error" :message="contentError" />
        <button class="gallery-text-link" type="button" @click="retryContent">{{ copy.retry }}<Right aria-hidden="true" /></button>
      </section>
      <template v-else>
        <section class="collection-browse gallery-browse" aria-labelledby="collection-objects-title">
          <header class="gallery-section-head gallery-section-head--compact">
            <h2 id="collection-objects-title">{{ copy.board }}</h2>
            <span class="gallery-count">{{ artifactCountLabel(artifactTotal) }}</span>
          </header>

          <div v-if="displayArtifacts.length" class="gallery-objects" :class="{ 'gallery-objects--filtered': selectedCategory || collectionPage > 1 }">
            <RouterLink
              v-for="(artifact, index) in displayArtifacts"
              :key="artifact.slug"
              class="gallery-object"
              :class="{ 'gallery-object--featured': index === 0 && !selectedCategory && collectionPage === 1 }"
              :to="`/artifacts/${artifact.slug}`"
              :aria-label="`${copy.view}：${artifactCopy(artifact).title}`"
            >
              <div class="gallery-object__media">
                <img
                  v-if="artifactVisual(artifact) && !failedImages.has(artifactVisual(artifact))"
                  :src="artifactVisual(artifact)"
                  :srcset="mediaSrcset(artifactVisual(artifact))"
                  :sizes="artifactMediaSizes()"
                  alt=""
                  :loading="index < 3 ? 'eager' : 'lazy'"
                  :fetchpriority="index === 0 ? 'high' : undefined"
                  decoding="async"
                  @error="failedImages.add(artifactVisual(artifact))"
                />
                <span v-else class="gallery-image-fallback"><Picture aria-hidden="true" />{{ copy.imageUnavailable }}</span>
              </div>
              <div class="gallery-object__caption">
                <p class="gallery-object__meta">{{ artifactCopy(artifact).categoryName }}<span v-if="isConcept(artifact)"> · {{ copy.concept }}</span><span v-if="artifact.slug === 'heluo-bronze-ding'"> · {{ locale === 'en-US' ? 'AI editorial image' : 'AI策展配图' }}</span></p>
                <div class="gallery-object__title-row"><h3>{{ objectTitle(artifact) }}</h3><TopRight aria-hidden="true" /></div>
                <p class="gallery-object__period">{{ artifactCopy(artifact).period || copy.fallbackPeriod }} · {{ artifactCopy(artifact).material }}</p>
              </div>
            </RouterLink>
          </div>
          <div v-else class="collection-state collection-state--empty gallery-state">
            <h3>{{ copy.emptyExhibits }}</h3>
            <button v-if="selectedCategory" class="gallery-text-link" type="button" @click="showAllCollection">{{ copy.backToAll }}<Right aria-hidden="true" /></button>
          </div>
        </section>

        <nav v-if="collectionTotalPages > 1" class="collection-pagination gallery-pagination" :aria-label="copy.pagination">
          <button type="button" :aria-label="copy.previous" :disabled="collectionPage === 1" @click="goToCollectionPage(collectionPage - 1)"><ArrowLeft aria-hidden="true" /></button>
          <span>{{ collectionPage }} / {{ collectionTotalPages }}</span>
          <button type="button" :aria-label="copy.next" :disabled="collectionPage === collectionTotalPages" @click="goToCollectionPage(collectionPage + 1)"><ArrowRight aria-hidden="true" /></button>
        </nav>

        <section v-if="categories.length" class="gallery-themes" aria-labelledby="gallery-themes-title">
          <div class="gallery-themes__intro">
            <h2 id="gallery-themes-title">{{ copy.themes }}</h2>
            <p>{{ copy.themesIntro }}</p>
          </div>
          <nav class="gallery-themes__links" :aria-label="copy.filters">
            <RouterLink v-for="category in categories" :key="category.code" :to="{ path: '/explore', query: { category: category.code }, hash: '#collection-title' }">
              <img v-if="themeMedia[category.code] && !failedImages.has(themeMedia[category.code])" :src="themeMedia[category.code]" :srcset="mediaSrcset(themeMedia[category.code])" sizes="80px" alt="" width="80" height="80" loading="lazy" decoding="async" @error="failedImages.add(themeMedia[category.code])" />
              <span class="gallery-themes__copy"><strong>{{ categoryName(category) }}</strong><small v-if="themeDescriptions[category.code]">{{ themeDescriptions[category.code] }}</small></span>
              <Right aria-hidden="true" />
            </RouterLink>
          </nav>
        </section>

        <section v-if="articles.length" class="collection-reading gallery-reading" aria-labelledby="collection-reading-title">
          <header class="gallery-section-head">
            <h2 id="collection-reading-title">{{ copy.stories }}</h2>
            <span class="gallery-count">{{ articleCountLabel(articleTotal) }}</span>
          </header>
          <div class="gallery-reading-list">
            <RouterLink v-for="article in articles" :key="article.slug" class="gallery-story" :to="`/articles/${article.slug}`">
              <div class="gallery-story__media">
                <img v-if="articleVisual(article) && !failedImages.has(articleVisual(article))" :src="articleVisual(article)" :srcset="mediaSrcset(articleVisual(article))" sizes="(max-width: 520px) 80px, 180px" alt="" loading="lazy" decoding="async" @error="failedImages.add(articleVisual(article))" />
                <span v-else class="gallery-image-fallback"><Picture aria-hidden="true" /><span class="sr-only">{{ copy.imageUnavailable }}</span></span>
              </div>
              <div class="gallery-story__body">
                <p class="gallery-story__meta">{{ articleCopy(article).categoryName }} · {{ articleCopy(article).authorDisplay || copy.fallbackAuthor }}</p>
                <h3>{{ articleCopy(article).title }}</h3>
                <p class="gallery-story__summary">{{ articleCopy(article).summary }}</p>
              </div>
              <Right class="gallery-story__arrow" aria-hidden="true" />
            </RouterLink>
          </div>
        </section>
        <section v-else class="collection-state collection-state--empty gallery-state">
          <h2>{{ copy.stories }}</h2>
          <p>{{ copy.emptyArticles }}</p>
        </section>
      </template>
    </template>
  </section>
</template>
