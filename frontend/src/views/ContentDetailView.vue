<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { motion } from 'motion-v'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { apiGet } from '../lib/api'
import { createGsapContext, isConstrainedGsapReveal, shouldRunGsapReveal } from '../lib/gsap'
import type { ArticleDetail, ArtifactDetail } from '../lib/content'
import InlineStatus from '../components/InlineStatus.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'

gsap.registerPlugin(ScrollTrigger)

const route = useRoute()
const loading = ref(true)
const error = ref('')
const artifact = ref<ArtifactDetail | null>(null)
const article = ref<ArticleDetail | null>(null)
const readingProgress = ref(0)
const root = ref<HTMLElement | null>(null)
let gsapContext: gsap.Context | undefined

const isArtifact = computed(() => route.name === 'artifact-detail')
const detail = computed(() => artifact.value ?? article.value)
const contentBlocks = computed(() => (detail.value?.content.split(/\n\s*\n/).filter(Boolean) ?? []).map((text) => ({
  text,
  heading: text.length <= 30 && (text.includes('｜') || text === '留给观众的问题'),
})))

function setupScrollNarrative() {
  if (!shouldRunGsapReveal() || !root.value || !detail.value) return
  gsapContext?.revert()
  gsapContext = createGsapContext(root.value, () => {
    const constrained = isConstrainedGsapReveal()
    const duration = constrained ? 0.18 : 0.42
    const offset = constrained ? 7 : 14
    const stagger = constrained ? 0.04 : 0.056
    const headerTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    headerTimeline
      .from('[data-motion="detail-index"]', { autoAlpha: 0, x: constrained ? 0 : -12, duration: constrained ? 0.16 : 0.28 }, 0)
      .from('[data-motion="detail-header"] > *', { autoAlpha: 0, y: constrained ? 5 : 14, duration: constrained ? 0.18 : 0.34, stagger: constrained ? 0.025 : 0.055, clearProps: 'transform' }, constrained ? 0.02 : 0.06)
      .fromTo('[data-motion="detail-cover"]', {
        autoAlpha: constrained ? 0 : 0.45,
        scale: constrained ? 1 : 1.045,
        clipPath: constrained ? 'inset(0% 0% 0% 0%)' : 'inset(8% 0% 8% 0%)',
      }, {
        autoAlpha: 1,
        scale: 1,
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: constrained ? 0.18 : 0.56,
        ease: 'power3.out',
        clearProps: 'opacity,visibility,transform,clip-path',
      }, constrained ? 0.03 : 0.12)
    const facts = gsap.utils.toArray<HTMLElement>('[data-motion="facts"]', root.value)
    if (facts.length) {
      gsap.set(facts, { autoAlpha: 0, y: offset })
      ScrollTrigger.batch('[data-motion-page="content-detail"] [data-motion="facts"]', { start: 'top 82%', once: true, onEnter: (elements) => gsap.to(elements, { autoAlpha: 1, y: 0, duration, stagger, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform' }) })
    }
    const readingNote = root.value?.querySelector<HTMLElement>('[data-motion="reading-note"]')
    if (readingNote) {
      const noteTimeline = gsap.timeline({ scrollTrigger: { trigger: readingNote, start: 'top 88%', once: true }, defaults: { ease: 'power3.out' } })
      noteTimeline
        .from(readingNote.children, { autoAlpha: 0, x: constrained ? 0 : -12, duration: constrained ? 0.18 : 0.32, stagger: constrained ? 0.025 : 0.055, clearProps: 'transform' })
        .from('[data-motion="reading-rule"]', { scaleY: 0, transformOrigin: 'top', duration: constrained ? 0.14 : 0.28, clearProps: 'transform' }, constrained ? 0 : '-=0.12')
    }
    const paragraphs = gsap.utils.toArray<HTMLElement>('[data-motion="paragraph"]', root.value)
    if (paragraphs.length) {
      gsap.set(paragraphs, { autoAlpha: 0, y: offset })
      ScrollTrigger.batch('[data-motion-page="content-detail"] [data-motion="paragraph"]', { start: 'top 86%', once: true, onEnter: (elements) => gsap.to(elements, { autoAlpha: 1, y: 0, duration, stagger, ease: 'power3.out', overwrite: 'auto', clearProps: 'transform' }) })
    }
    const relatedHeading = root.value?.querySelectorAll<HTMLElement>('[data-motion="related-heading"]')
    if (relatedHeading?.length) gsap.from(relatedHeading, { autoAlpha: 0, y: offset, duration, stagger, ease: 'power3.out', scrollTrigger: { trigger: relatedHeading[0], start: 'top 88%', once: true }, clearProps: 'transform' })
    const related = gsap.utils.toArray<HTMLElement>('[data-motion="related"]', root.value)
    if (related.length) {
      gsap.set(related, { autoAlpha: 0, y: offset })
      ScrollTrigger.batch('[data-motion-page="content-detail"] [data-motion="related"]', {
        start: 'top 88%', once: true, onEnter: (elements) => {
          const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
          timeline
            .to(elements, { autoAlpha: 1, y: 0, duration: constrained ? 0.18 : 0.36, stagger: constrained ? 0.04 : 0.072, overwrite: 'auto', clearProps: 'transform' })
            .from(elements.flatMap((element) => Array.from(element.querySelectorAll('[data-motion="related-media"]'))), { autoAlpha: constrained ? 1 : 0.6, scale: constrained ? 1 : 1.04, duration: constrained ? 0.16 : 0.36, clearProps: 'opacity,visibility,transform' }, constrained ? '<' : '<0.05')
            .from(elements.flatMap((element) => Array.from(element.querySelectorAll('[data-motion="related-copy"] > *'))), { autoAlpha: 0, x: constrained ? 0 : 12, duration: constrained ? 0.16 : 0.28, stagger: constrained ? 0.02 : 0.04, clearProps: 'transform' }, constrained ? '<' : '<0.06')
        },
      })
    }
    const cta = root.value?.querySelector<HTMLElement>('[data-motion="cta"]')
    if (cta) gsap.from(cta.children, { autoAlpha: 0, y: offset, duration, stagger, ease: 'power3.out', scrollTrigger: { trigger: cta, start: 'top 90%', once: true }, clearProps: 'transform' })
    ScrollTrigger.refresh()
  })
}

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
    await nextTick()
    setupScrollNarrative()
  }
}

function updateReadingProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  readingProgress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
}

watch(() => route.fullPath, loadDetail)
onMounted(() => { loadDetail(); window.addEventListener('scroll', updateReadingProgress, { passive: true }); updateReadingProgress() })
onBeforeUnmount(() => { gsapContext?.revert(); window.removeEventListener('scroll', updateReadingProgress) })
</script>

<template>
  <LoadingSkeleton v-if="loading" class="detail-state" :lines="6" label="正在加载文物内容" />
  <section v-else-if="error" class="state-panel detail-state state-panel--action"><InlineStatus kind="error" :message="error" /><h1>暂时无法打开这页内容</h1><p>内容可能尚未发布，或者服务暂时不可用。</p><RouterLink to="/explore">返回探索馆藏 →</RouterLink></section>
  <div v-else-if="detail" ref="root" class="detail-page-shell" data-motion-page="content-detail">
  <motion.article class="detail-page" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.3 }">
    <div class="reading-progress" :style="{ '--progress': `${readingProgress * 100}%` }" role="progressbar" aria-label="阅读进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(readingProgress * 100)"></div>
    <RouterLink class="back-link" to="/explore">← 返回探索馆藏</RouterLink>
    <header class="detail-header">
      <div class="detail-index" data-motion="detail-index"><span>{{ isArtifact ? 'OBJECT' : 'JOURNAL' }}</span><b>{{ isArtifact ? '01' : 'A' }}</b><small>HELUO ARCHIVE</small></div>
      <div data-motion="detail-header"><p class="eyebrow">{{ isArtifact ? 'ARTIFACT STORY' : 'CULTURAL JOURNAL' }}</p><p class="detail-category">{{ detail.category.name }}</p><h1>{{ detail.title }}</h1><p class="detail-summary">{{ detail.summary }}</p></div>
      <img v-if="detail.coverImageUrl" data-motion="detail-cover" :src="detail.coverImageUrl" :alt="detail.title" decoding="async" />
    </header>

    <dl v-if="artifact" class="object-facts">
      <div v-if="artifact.period" data-motion="facts"><dt>时代意象</dt><dd>{{ artifact.period }}</dd></div>
      <div v-if="artifact.material" data-motion="facts"><dt>材质</dt><dd>{{ artifact.material }}</dd></div>
      <div v-if="artifact.dimensions" data-motion="facts"><dt>尺寸</dt><dd>{{ artifact.dimensions }}</dd></div>
      <div v-if="artifact.collectionLocation" data-motion="facts"><dt>位置</dt><dd>{{ artifact.collectionLocation }}</dd></div>
    </dl>

    <section class="detail-reading"><aside data-motion="reading-note"><span>READING NOTE</span><p>沿着器物的时代、材料与故事继续阅读。</p><i data-motion="reading-rule" aria-hidden="true"></i></aside><div class="detail-content"><template v-for="(block, index) in contentBlocks" :key="`${index}-${block.text}`"><h2 v-if="block.heading" data-motion="paragraph">{{ block.text }}</h2><p v-else data-motion="paragraph">{{ block.text }}</p></template></div></section>

  <section v-if="artifact && artifact.exhibits.length" class="related-exhibits"><p class="section-label" data-motion="related-heading">关联数字展项</p><h2 data-motion="related-heading">继续在线近观</h2><RouterLink v-for="exhibit in artifact.exhibits" :key="exhibit.slug" class="related-exhibit" data-motion="related" :to="`/exhibits/${exhibit.slug}`"><img v-if="exhibit.coverImageUrl" data-motion="related-media" :src="exhibit.coverImageUrl" :alt="exhibit.title" loading="lazy" decoding="async" /><div data-motion="related-copy"><h3>{{ exhibit.title }}</h3><p>{{ exhibit.summary }}</p><span>进入 3D 展项 →</span></div></RouterLink></section>

    <section class="detail-cta" data-motion="cta"><p>在线感受过展品后，欢迎安排一次线下相见。</p><RouterLink to="/appointment">预约线下参观 →</RouterLink></section>
  </motion.article>
  </div>
</template>
