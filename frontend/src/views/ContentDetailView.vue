<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { motion } from 'motion-v'
import { apiGet } from '../lib/api'
import type { ArticleDetail, ArtifactDetail } from '../lib/content'
import InlineStatus from '../components/InlineStatus.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const artifact = ref<ArtifactDetail | null>(null)
const article = ref<ArticleDetail | null>(null)
const readingProgress = ref(0)

const isArtifact = computed(() => route.name === 'artifact-detail')
const detail = computed(() => artifact.value ?? article.value)
const paragraphs = computed(() => detail.value?.content.split(/\n\s*\n/).filter(Boolean) ?? [])

async function loadDetail() {
  loading.value = true
  error.value = ''
  artifact.value = null
  article.value = null
  const slug = String(route.params.slug)
  try {
    if (isArtifact.value) {
      artifact.value = await apiGet<ArtifactDetail>(`/artifacts/${encodeURIComponent(slug)}`)
    } else {
      article.value = await apiGet<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`)
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '内容加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function updateReadingProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  readingProgress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
}

watch(() => route.fullPath, loadDetail)
onMounted(() => { loadDetail(); window.addEventListener('scroll', updateReadingProgress, { passive: true }); updateReadingProgress() })
onBeforeUnmount(() => window.removeEventListener('scroll', updateReadingProgress))
</script>

<template>
  <LoadingSkeleton v-if="loading" class="detail-state" :lines="6" label="正在加载文物内容" />
  <section v-else-if="error" class="state-panel detail-state state-panel--action"><InlineStatus kind="error" :message="error" /><h1>暂时无法打开这页内容</h1><p>内容可能尚未发布，或者服务暂时不可用。</p><RouterLink to="/explore">返回探索馆藏 →</RouterLink></section>
  <motion.article v-else-if="detail" class="detail-page" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.3 }">
    <div class="reading-progress" :style="{ '--progress': `${readingProgress * 100}%` }" role="progressbar" aria-label="阅读进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(readingProgress * 100)"></div>
    <RouterLink class="back-link" to="/explore">← 返回探索馆藏</RouterLink>
    <header class="detail-header">
      <div class="detail-index"><span>{{ isArtifact ? 'OBJECT' : 'JOURNAL' }}</span><b>{{ isArtifact ? '01' : 'A' }}</b><small>HELUO ARCHIVE</small></div>
      <div><p class="eyebrow">{{ isArtifact ? 'ARTIFACT STORY' : 'CULTURAL JOURNAL' }}</p><p class="detail-category">{{ detail.category.name }}</p><h1>{{ detail.title }}</h1><p class="detail-summary">{{ detail.summary }}</p></div>
      <img v-if="detail.coverImageUrl" :src="detail.coverImageUrl" :alt="detail.title" decoding="async" />
    </header>

    <dl v-if="artifact" class="object-facts">
      <div v-if="artifact.period"><dt>时代意象</dt><dd>{{ artifact.period }}</dd></div>
      <div v-if="artifact.material"><dt>材质</dt><dd>{{ artifact.material }}</dd></div>
      <div v-if="artifact.dimensions"><dt>尺寸</dt><dd>{{ artifact.dimensions }}</dd></div>
      <div v-if="artifact.collectionLocation"><dt>位置</dt><dd>{{ artifact.collectionLocation }}</dd></div>
    </dl>

    <section class="detail-reading"><aside><span>READING NOTE</span><p>沿着器物的时代、材料与故事继续阅读。</p><i aria-hidden="true"></i></aside><div class="detail-content"><p v-for="paragraph in paragraphs" :key="paragraph">{{ paragraph }}</p></div></section>

  <section v-if="artifact && artifact.exhibits.length" class="related-exhibits"><p class="section-label">关联数字展项</p><h2>继续在线近观</h2><RouterLink v-for="exhibit in artifact.exhibits" :key="exhibit.slug" class="related-exhibit" :to="`/exhibits/${exhibit.slug}`"><img v-if="exhibit.coverImageUrl" :src="exhibit.coverImageUrl" :alt="exhibit.title" loading="lazy" decoding="async" /><div><h3>{{ exhibit.title }}</h3><p>{{ exhibit.summary }}</p><span>进入 3D 展项 →</span></div></RouterLink></section>

    <section class="detail-cta"><p>在线感受过展品后，欢迎安排一次线下相见。</p><RouterLink to="/appointment">预约线下参观 →</RouterLink></section>
  </motion.article>
</template>
