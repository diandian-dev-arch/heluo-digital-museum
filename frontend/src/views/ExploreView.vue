<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { motion } from 'motion-v'
import { apiGet, type ContentPage } from '../lib/api'
import type { ArticleCard, ArtifactCard, Category, SearchResult } from '../lib/content'
import { useLocale } from '../stores/locale'
import InlineStatus from '../components/InlineStatus.vue'

const categories = ref<Category[]>([])
const artifacts = ref<ArtifactCard[]>([])
const articles = ref<ArticleCard[]>([])
const searchResults = ref<SearchResult[]>([])
const selectedCategory = ref('')
const keyword = ref('')
const loading = ref(true)
const searching = ref(false)
const error = ref('')
const { locale } = useLocale()

const copy = computed(() => locale.value === 'en-US' ? {
  title:'Enter Heluo stories through a single object.', intro:'The first materials are self-created concept exhibits and reading content. Filter by interest, then search for objects and stories.', searchLabel:'Search artifacts or articles', placeholder:'Try: pattern, river, bronze…', searching:'Searching…', search:'Search', clear:'Clear', results:'Search results for', items:'items', finding:'Finding content…', none:'No matching content. Try a shorter or more specific keyword.', artifact:'Artifact', article:'Article', read:'Read details →', all:'All', loading:'Loading collection content…', exhibits:'Collection objects', pieces:'pieces', emptyExhibits:'There are no published exhibits in this category yet.', view:'View details →', stories:'Further reading', articles:'articles', emptyArticles:'There are no published articles in this category yet.', start:'Start reading →', fallbackPeriod:'Concept exhibit', fallbackAuthor:'Heluo Digital Museum'
} : {
  title:'从一件器物，走进河洛故事。', intro:'这里的首批内容均为项目组自主创作的概念展品与阅读素材。先按兴趣筛选，再用关键词找到想了解的器物和故事。', searchLabel:'搜索文物或文章', placeholder:'试试搜索：纹样、河流、青铜……', searching:'搜索中…', search:'搜索', clear:'清除', results:'的搜索结果', items:'项', finding:'正在查找内容…', none:'没有找到匹配内容。可以换一个更短、更具体的关键词试试。', artifact:'文物', article:'文章', read:'阅读详情 →', all:'全部', loading:'正在加载馆藏内容…', exhibits:'馆藏器物', pieces:'件', emptyExhibits:'这个分类暂时还没有已发布的展品。', view:'查看详情 →', stories:'延伸阅读', articles:'篇', emptyArticles:'这个分类暂时还没有已发布的文章。', start:'开始阅读 →', fallbackPeriod:'概念展品', fallbackAuthor:'河洛数字博物馆'
})

const hasSearchResults = computed(() => keyword.value.trim().length > 0)
const preferredOrder = ['water-bird-bronze', 'heluo-bronze-jue', 'river-map-jade-bi', 'painted-pottery-water-jar', 'river-map-pattern-stone']
const displayArtifacts = computed(() => [...artifacts.value].sort((a, b) => {
  const ai = preferredOrder.indexOf(a.slug)
  const bi = preferredOrder.indexOf(b.slug)
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
}))
function artifactVisual(artifact: ArtifactCard) {
  if (artifact.slug === 'heluo-bronze-jue') return '/media/editorial/hero-bronze-ding.webp'
  if (artifact.slug === 'river-map-jade-bi') return '/media/editorial/jade-pig-dragon.webp'
  return artifact.coverImageUrl
}

async function loadContent() {
  loading.value = true
  error.value = ''
  try {
    const categoryQuery = selectedCategory.value ? `&categoryCode=${encodeURIComponent(selectedCategory.value)}` : ''
    const [categoryData, artifactData, articleData] = await Promise.all([
      apiGet<Category[]>('/categories'),
      apiGet<ContentPage<ArtifactCard>>(`/artifacts?page=1&size=12${categoryQuery}`),
      apiGet<ContentPage<ArticleCard>>(`/articles?page=1&size=12${categoryQuery}`),
    ])
    categories.value = categoryData
    artifacts.value = artifactData.items
    articles.value = articleData.items
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '内容加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  const query = keyword.value.trim()
  if (!query) { searchResults.value = []; return }
  searching.value = true
  error.value = ''
  try {
    const result = await apiGet<ContentPage<SearchResult>>(`/search?keyword=${encodeURIComponent(query)}&type=all&page=1&size=24`)
    searchResults.value = result.items
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '搜索失败，请稍后重试。'
  } finally { searching.value = false }
}

function clearSearch() { keyword.value = ''; searchResults.value = [] }
watch(selectedCategory, loadContent)
onMounted(loadContent)
</script>

<template>
  <main class="collection-page">
    <section class="collection-head">
      <div class="collection-intro">
        <p class="eyebrow">COLLECTION EXPLORER</p>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.intro }}</p>
        <form class="content-search" @submit.prevent="runSearch">
          <label class="sr-only" for="content-search">{{ copy.searchLabel }}</label>
          <input id="content-search" v-model="keyword" type="search" maxlength="100" autocomplete="off" enterkeyhint="search" :placeholder="copy.placeholder" aria-controls="collection-search-results" :aria-expanded="hasSearchResults" />
          <motion.button type="submit" :disabled="searching" :aria-busy="searching" :while-press="{ scale: 0.97 }">{{ searching ? copy.searching : copy.search }}</motion.button>
          <button v-if="hasSearchResults" class="button-link" type="button" @click="clearSearch">{{ copy.clear }}</button>
        </form>
      </div>

      <div class="collection-map" aria-hidden="true">
        <svg viewBox="0 0 720 290" preserveAspectRatio="none">
          <path class="map-river map-river--wide" d="M0 131c76-27 95 39 166 10s74-65 139-40 66 71 133 40 66-81 141-39 80 36 141-3" />
          <path class="map-river" d="M0 130c77-21 96 32 164 6s78-60 139-35 66 64 134 35 69-72 140-35 81 32 143-5" />
          <path class="map-branch" d="M305 103c-17 49 12 74 53 91 44 18 43 55 85 76" />
          <g><circle cx="95" cy="145" r="3"/><line x1="95" y1="145" x2="95" y2="190"/><text x="50" y="211">01 河洛故事</text></g>
          <g><circle cx="229" cy="104" r="3"/><line x1="229" y1="104" x2="229" y2="62"/><text x="194" y="51">02 青铜礼器</text></g>
          <g><circle cx="432" cy="126" r="3"/><line x1="432" y1="126" x2="432" y2="69"/><text x="399" y="54">03 玉石意象</text></g>
          <g><circle cx="573" cy="103" r="3"/><line x1="573" y1="103" x2="573" y2="151"/><text x="540" y="171">04 陶器生活</text></g>
          <g><circle cx="443" cy="270" r="3"/><line x1="443" y1="270" x2="443" y2="230"/><text x="407" y="218">05 石刻碑碣</text></g>
        </svg>
      </div>
    </section>

    <InlineStatus v-if="error" class="page-alert" kind="error" :message="error" />

    <section v-if="hasSearchResults" id="collection-search-results" class="content-section search-results" aria-live="polite" :aria-busy="searching">
      <div class="section-heading"><div><p class="section-label">搜索结果</p><h2>{{ locale === 'en-US' ? `${copy.results} “${keyword}”` : `“${keyword}”${copy.results}` }}</h2></div><span>{{ searchResults.length }} {{ copy.items }}</span></div>
      <div v-if="searching" class="state-panel">{{ copy.finding }}</div>
      <div v-else-if="searchResults.length === 0" class="state-panel">{{ copy.none }}</div>
      <div v-else class="content-grid">
        <RouterLink v-for="item in searchResults" :key="`${item.type}-${item.slug}`" class="content-card" :to="`/${item.type === 'artifact' ? 'artifacts' : 'articles'}/${item.slug}`"><img v-if="item.coverImageUrl" :src="item.coverImageUrl" :alt="item.title" loading="lazy" decoding="async" /><div><p class="card-meta">{{ item.type === 'artifact' ? copy.artifact : copy.article }} · {{ item.categoryName }}</p><h3>{{ item.title }}</h3><p>{{ item.summary }}</p><span>{{ copy.read }}</span></div></RouterLink>
      </div>
    </section>

    <template v-else>
      <nav class="collection-filters" aria-label="分类筛选">
        <motion.button :class="{ active: selectedCategory === '' }" type="button" :aria-pressed="selectedCategory === ''" :while-press="{ scale: 0.97 }" @click="selectedCategory = ''"><span>{{ copy.all }}</span><sup>01</sup></motion.button>
        <motion.button v-for="(category,index) in categories" :key="category.code" :class="{ active: selectedCategory === category.code }" type="button" :aria-pressed="selectedCategory === category.code" :while-press="{ scale: 0.97 }" @click="selectedCategory = category.code"><span>{{ category.name }}</span><sup>0{{ index + 2 }}</sup></motion.button>
      </nav>

      <div v-if="loading" class="state-panel collection-state">{{ copy.loading }}</div>
      <template v-else>
        <motion.section class="artifact-board" layout aria-label="馆藏器物" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.3 }">
          <RouterLink v-for="(artifact,index) in displayArtifacts" :key="artifact.slug" v-pointer-surface="{ kind: 'collection', maxTilt: 1.15 }" :class="['artifact-tile', `artifact-tile--${index + 1}`, { 'artifact-tile--transparent': artifact.slug === 'heluo-bronze-jue' }]" :to="`/artifacts/${artifact.slug}`">
            <img v-if="artifact.coverImageUrl" :src="artifactVisual(artifact)" :alt="artifact.title" loading="lazy" decoding="async" />
            <div class="artifact-tile-copy"><span>0{{ index + 1 }}</span><h2>{{ artifact.title }}</h2><p>{{ artifact.period || copy.fallbackPeriod }}<br />{{ artifact.categoryName }}</p><b>{{ copy.view }}</b></div>
          </RouterLink>
          <div v-if="displayArtifacts.length === 0" class="state-panel">{{ copy.emptyExhibits }}</div>
        </motion.section>

        <section v-if="articles.length" class="content-section collection-stories">
      <div class="section-heading"><div><p class="section-label">专题阅读</p><h2>{{ copy.stories }}</h2></div><span>{{ articles.length }} {{ copy.articles }}</span></div>
          <div class="content-grid content-grid--articles"><RouterLink v-for="(article, index) in articles" :key="article.slug" :class="['content-card', 'story-card', { 'story-card--lead': index === 0 }]" :to="`/articles/${article.slug}`"><div class="story-card__media"><img v-if="article.coverImageUrl" :src="article.coverImageUrl" :alt="article.title" loading="lazy" decoding="async" /><span class="story-card__number">0{{ index + 1 }}</span></div><div class="story-card__copy"><p class="card-meta">{{ article.categoryName }} · {{ article.authorDisplay || copy.fallbackAuthor }}</p><h3>{{ article.title }}</h3><p>{{ article.summary }}</p><span class="story-card__action">{{ copy.start }}</span></div></RouterLink></div>
        </section>
      </template>
    </template>
  </main>
</template>
