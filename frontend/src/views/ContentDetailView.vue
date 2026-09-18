<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { apiGet } from '../lib/api'
import { mediaSrcset } from '../lib/responsiveMedia'
import { createGsapContext, isConstrainedGsapReveal, shouldRunGsapReveal } from '../lib/gsap'
import { localizedContent } from '../lib/contentLocale'
import type { ArticleDetail, ArtifactDetail } from '../lib/content'
import InlineStatus from '../components/InlineStatus.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import PlainTextLinks from '../components/PlainTextLinks.vue'
import { useLocale } from '../stores/locale'

gsap.registerPlugin(ScrollTrigger)

const route = useRoute()
const router = useRouter()
const { locale } = useLocale()
const imageFailed = ref(false)
const isEnglish = computed(() => locale.value === 'en-US')
const copy = computed(() => isEnglish.value ? {
  back: 'Back to collection', loading: 'Loading content', failure: 'This content is unavailable', failureDetail: 'It may be unpublished or temporarily unavailable.', retry: 'Try again',
  period: 'Period inspiration', material: 'Material', dimensions: 'Dimensions', location: 'Location', contents: 'On this page', reading: 'Reading progress', note: 'Follow the object through its materials and story.',
  related: 'Related digital exhibits', next: 'Take a closer look', enter: 'Open 3D exhibit', visit: 'Continue your exploration with a visit.', booking: 'Book a visit', image: 'Image unavailable',
  source: 'An original concept exhibit created for this project. It is not a historical collection record.',
} : {
  back: '返回探索馆藏', loading: '正在加载文物内容', failure: '暂时无法打开这页内容', failureDetail: '内容可能尚未发布，或者服务暂时不可用。', retry: '重新加载',
  period: '时代意象', material: '材质', dimensions: '尺寸', location: '位置', contents: '本文目录', reading: '阅读进度', note: '沿着器物的时代、材料与故事继续阅读。',
  related: '关联数字展项', next: '继续在线近观', enter: '进入 3D 展项', visit: '在线感受过展品后，欢迎安排一次线下相见。', booking: '预约线下参观', image: '图片暂时无法显示',
  source: '本项目自主创作的概念展品，不代表历史馆藏实物档案。',
})
const loading = ref(true)
const error = ref('')
const artifact = ref<ArtifactDetail | null>(null)
const article = ref<ArticleDetail | null>(null)
const readingProgress = ref(0)
const root = ref<HTMLElement | null>(null)
let gsapContext: gsap.Context | undefined

const isArtifact = computed(() => route.name === 'artifact-detail')
const detail = computed(() => {
  const source = artifact.value ?? article.value
  return source ? localizedContent(source, locale.value) : null
})
const contentBlocks = computed(() => (detail.value?.content.split(/\n\s*\n/).filter(Boolean) ?? []).map((text) => ({
  text,
  heading: text.length <= 30 && (text.includes('｜') || text === '留给观众的问题'),
})))
const contents = computed(() => contentBlocks.value.flatMap((block, index) => block.heading ? [{ title: block.text, id: `reading-section-${index}` }] : []))
const isConcept = computed(() => (artifact.value ?? article.value)?.title.includes('概念展品') ?? false)
function returnToCollection() {
  const previous = window.history.state?.back
  if (typeof previous === 'string' && (previous === '/explore' || previous.startsWith('/explore?'))) router.back()
  else void router.push('/explore')
}
watch([detail, locale], () => {
  if (!detail.value) return
  document.title = `${detail.value.title} | ${isEnglish.value ? 'Heluo Digital Museum' : '河洛数字博物馆'}`
  document.querySelector('meta[name="description"]')?.setAttribute('content', detail.value.summary)
}, { flush: 'post' })

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
      ScrollTrigger.batch('[data-motion-page="content-detail"] [data-motion="facts"]', { start: 'top 82%', once: true, onEnter: (elements) => gsap.fromTo(elements, { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, duration, stagger, ease: 'power3.out', overwrite: 'auto', clearProps: 'opacity,visibility,transform' }) })
    }
    const readingNote = root.value?.querySelector<HTMLElement>('[data-motion="reading-note"]')
    if (readingNote) {
      ScrollTrigger.create({ trigger: readingNote, start: 'top 88%', once: true, onEnter: () => {
        const noteCopy = readingNote.querySelectorAll<HTMLElement>('span, p')
        const readingRule = readingNote.querySelector<HTMLElement>('[data-motion="reading-rule"]')
        const noteTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
        noteTimeline.fromTo(noteCopy, { autoAlpha: 0, x: constrained ? 0 : -12 }, { autoAlpha: 1, x: 0, duration: constrained ? 0.18 : 0.32, stagger: constrained ? 0.025 : 0.055, clearProps: 'opacity,visibility,transform' })
        if (readingRule) noteTimeline.fromTo(readingRule, { scaleY: 0, transformOrigin: 'top' }, { scaleY: 1, duration: constrained ? 0.14 : 0.28, clearProps: 'transform' }, constrained ? 0 : '-=0.12')
      } })
    }
    const paragraphs = gsap.utils.toArray<HTMLElement>('[data-motion="paragraph"]', root.value)
    if (paragraphs.length) {
      ScrollTrigger.batch('[data-motion-page="content-detail"] [data-motion="paragraph"]', { start: 'top 86%', once: true, onEnter: (elements) => gsap.fromTo(elements, { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, duration, stagger, ease: 'power3.out', overwrite: 'auto', clearProps: 'opacity,visibility,transform' }) })
    }
    const relatedHeading = root.value?.querySelectorAll<HTMLElement>('[data-motion="related-heading"]')
    if (relatedHeading?.length) ScrollTrigger.create({ trigger: relatedHeading[0], start: 'top 88%', once: true, onEnter: () => gsap.fromTo(relatedHeading, { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, duration, stagger, ease: 'power3.out', clearProps: 'opacity,visibility,transform' }) })
    const related = gsap.utils.toArray<HTMLElement>('[data-motion="related"]', root.value)
    if (related.length) {
      ScrollTrigger.batch('[data-motion-page="content-detail"] [data-motion="related"]', {
        start: 'top 88%', once: true, onEnter: (elements) => {
          const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
          timeline
            .fromTo(elements, { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, duration: constrained ? 0.18 : 0.36, stagger: constrained ? 0.04 : 0.072, overwrite: 'auto', clearProps: 'opacity,visibility,transform' })
            .fromTo(elements.flatMap((element) => Array.from(element.querySelectorAll('[data-motion="related-media"]'))), { autoAlpha: constrained ? 1 : 0.6, scale: constrained ? 1 : 1.04 }, { autoAlpha: 1, scale: 1, duration: constrained ? 0.16 : 0.36, clearProps: 'opacity,visibility,transform' }, constrained ? '<' : '<0.05')
            .fromTo(elements.flatMap((element) => Array.from(element.querySelectorAll('[data-motion="related-copy"] > *'))), { autoAlpha: 0, x: constrained ? 0 : 12 }, { autoAlpha: 1, x: 0, duration: constrained ? 0.16 : 0.28, stagger: constrained ? 0.02 : 0.04, clearProps: 'opacity,visibility,transform' }, constrained ? '<' : '<0.06')
        },
      })
    }
    const cta = root.value?.querySelector<HTMLElement>('[data-motion="cta"]')
    if (cta) ScrollTrigger.create({ trigger: cta, start: 'top 90%', once: true, onEnter: () => gsap.fromTo(cta.children, { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, duration, stagger, ease: 'power3.out', clearProps: 'opacity,visibility,transform' }) })
    ScrollTrigger.refresh()
  })
}

let detailRequestId = 0
async function loadDetail() {
  const requestId = ++detailRequestId
  loading.value = true
  error.value = ''
  artifact.value = null
  article.value = null
  imageFailed.value = false
  const slug = String(route.params.slug)
  try {
    if (isArtifact.value) {
      const data = await apiGet<ArtifactDetail>(`/artifacts/${encodeURIComponent(slug)}`)
      if (requestId === detailRequestId) artifact.value = data
    } else {
      const data = await apiGet<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`)
      if (requestId === detailRequestId) article.value = data
    }
  } catch (reason) {
    if (requestId === detailRequestId) error.value = reason instanceof Error ? reason.message : '内容加载失败，请稍后重试。'
  } finally {
    if (requestId !== detailRequestId) return
    loading.value = false
    await nextTick()
    setupScrollNarrative()
  }
}

function updateReadingProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  readingProgress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
}

watch(() => route.path, loadDetail)
onMounted(() => { loadDetail(); window.addEventListener('scroll', updateReadingProgress, { passive: true }); updateReadingProgress() })
onBeforeUnmount(() => { detailRequestId += 1; gsapContext?.revert(); window.removeEventListener('scroll', updateReadingProgress) })
</script>

<template>
  <LoadingSkeleton v-if="loading" class="detail-state" :lines="6" :label="copy.loading" />
  <section v-else-if="error" class="state-panel detail-state state-panel--action"><InlineStatus kind="error" :message="error" /><h1>{{ copy.failure }}</h1><p>{{ copy.failureDetail }}</p><button type="button" class="text-action" @click="loadDetail">{{ copy.retry }}</button><RouterLink to="/explore">{{ copy.back }}</RouterLink></section>
  <div v-else-if="detail" ref="root" class="detail-page-shell" data-motion-page="content-detail">
  <motion.article class="detail-page" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.3 }">
    <div class="reading-progress" :style="{ '--progress': readingProgress }" role="progressbar" :aria-label="copy.reading" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(readingProgress * 100)"></div>
    <RouterLink class="back-link" to="/explore" @click.prevent="returnToCollection">← {{ copy.back }}</RouterLink>
    <header class="detail-header">
      <div class="detail-index" data-motion="detail-index"><span>{{ isArtifact ? 'OBJECT' : 'JOURNAL' }}</span><b>{{ isArtifact ? '01' : 'A' }}</b><small>HELUO ARCHIVE</small></div>
      <div data-motion="detail-header"><p class="eyebrow">{{ isArtifact ? 'ARTIFACT STORY' : 'CULTURAL JOURNAL' }}</p><p class="detail-category">{{ detail.category.name }}</p><h1>{{ detail.title }}</h1><p class="detail-summary">{{ detail.summary }}</p></div>
      <img v-if="detail.coverImageUrl && !imageFailed" data-motion="detail-cover" :src="detail.coverImageUrl" :srcset="mediaSrcset(detail.coverImageUrl)" sizes="(max-width: 760px) calc(100vw - 40px), 960px" :alt="detail.title" decoding="async" @error="imageFailed = true" />
      <p v-else class="detail-image-fallback" role="status">{{ copy.image }}</p>
    </header>

    <dl v-if="artifact" class="object-facts">
      <div v-if="artifact.period" data-motion="facts"><dt>{{ copy.period }}</dt><dd>{{ artifact.period }}</dd></div>
      <div v-if="artifact.material" data-motion="facts"><dt>{{ copy.material }}</dt><dd>{{ artifact.material }}</dd></div>
      <div v-if="artifact.dimensions" data-motion="facts"><dt>{{ copy.dimensions }}</dt><dd>{{ artifact.dimensions }}</dd></div>
      <div v-if="artifact.collectionLocation" data-motion="facts"><dt>{{ copy.location }}</dt><dd>{{ artifact.collectionLocation }}</dd></div>
    </dl>

    <section class="detail-reading"><aside data-motion="reading-note"><span>{{ copy.contents }}</span><nav v-if="contents.length > 1" class="detail-toc" :aria-label="copy.contents"><a v-for="item in contents" :key="item.id" :href="`#${item.id}`">{{ item.title }}</a></nav><p v-else>{{ copy.note }}</p><p v-if="isConcept" class="detail-source">{{ copy.source }}</p><i data-motion="reading-rule" aria-hidden="true"></i></aside><div class="detail-content"><template v-for="(block, index) in contentBlocks" :key="`${index}-${block.text}`"><h2 v-if="block.heading" :id="`reading-section-${index}`" data-motion="paragraph">{{ block.text }}</h2><p v-else data-motion="paragraph"><PlainTextLinks :text="block.text" /></p></template></div></section>

  <section v-if="artifact && artifact.exhibits.length" class="related-exhibits"><p class="section-label" data-motion="related-heading">{{ copy.related }}</p><h2 data-motion="related-heading">{{ copy.next }}</h2><RouterLink v-for="exhibit in artifact.exhibits" :key="exhibit.slug" class="related-exhibit" data-motion="related" :to="`/exhibits/${exhibit.slug}`"><img v-if="exhibit.coverImageUrl" data-motion="related-media" :src="exhibit.coverImageUrl" :alt="exhibit.title" loading="lazy" decoding="async" /><div data-motion="related-copy"><h3>{{ exhibit.title }}</h3><p>{{ exhibit.summary }}</p><span>{{ copy.enter }} →</span></div></RouterLink></section>

    <section class="detail-cta" data-motion="cta"><p>{{ copy.visit }}</p><RouterLink to="/appointment">{{ copy.booking }} →</RouterLink></section>
  </motion.article>
  </div>
</template>
