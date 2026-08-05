<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { gsap } from 'gsap'
import { apiGet } from '../lib/api'
import { createGsapContext, isConstrainedGsapReveal, shouldRunGsapReveal } from '../lib/gsap'
import InlineStatus from '../components/InlineStatus.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import { useLocale } from '../stores/locale'
interface ExhibitCard { slug:string;title:string;summary:string;coverImageUrl:string;artifactSlug:string;artifactTitle:string }
const items=ref<ExhibitCard[]>([]);const loading=ref(true);const error=ref('')
const root = ref<HTMLElement | null>(null)
let gsapContext: gsap.Context | undefined
const { locale } = useLocale()
const copy = computed(() => locale.value === 'en-US' ? {
  title: 'Bring one object closer.', intro: 'Explore a Heluo bronze ding in 3D. Rotate, zoom, switch between solid and point-cloud views, and read the exhibit notes.', interaction: 'Interaction', interactionDetail: 'Rotate · Zoom · Read · Switch viewpoints', retry: 'Check the service and try again.', loading: 'Loading digital exhibits', emptyTitle: 'The gallery is being prepared', emptyText: 'There are no published digital exhibits yet. Explore the collection stories first.', explore: 'Explore the collection →', list: 'Digital exhibit list', related: 'Related artifact', start: 'Start exploring'
} : {
  title: '把一件器物，\n拿到眼前。', intro: '使用项目组自主创作的河洛风格青铜鼎 GLB 模型；你可以旋转、缩放，在实体与点云之间切换，并阅读展项说明。', interaction: '交互方式', interactionDetail: '旋转 · 缩放 · 阅读 · 切换视角', retry: '请检查服务后重试。', loading: '正在加载数字展项', emptyTitle: '展厅正在布展', emptyText: '当前没有已发布的数字展项，请先探索馆藏故事。', explore: '前往馆藏索引 →', list: '数字展项列表', related: '关联展品', start: '开始互动'
})
const englishExhibit = { title: 'Tripod Ding · Interactive Exhibit', summary: 'A digital exhibit based on the Cleveland Museum of Art CC0 Tripod (Ding) 1962.281 model, preserving its form and motifs with a rebuilt aged-bronze PBR material.', artifactTitle: 'Heluo-pattern Bronze Jue (Concept)' }
const displayItem = (item: ExhibitCard) => locale.value === 'en-US' && item.slug === 'heluo-bronze-ding-3d' ? { ...item, ...englishExhibit } : item
const coverFor = (item: ExhibitCard) => item.slug.includes('bronze-ding') ? '/media/editorial/exhibit-ding-moonlight.webp' : item.coverImageUrl
function revealExhibits() {
  if (!shouldRunGsapReveal() || !root.value || items.value.length === 0) return
  gsapContext?.revert()
  gsapContext = createGsapContext(root.value, () => {
    const cards = gsap.utils.toArray<HTMLElement>('[data-motion="item"]', root.value).slice(0, 12)
    if (!cards.length) return
    const constrained = isConstrainedGsapReveal()
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    timeline
      .from('[data-motion="archive-index"]', { autoAlpha: 0, x: constrained ? 0 : -12, duration: constrained ? 0.16 : 0.3 }, 0)
      .from('[data-motion="archive-copy"] > *', { autoAlpha: 0, y: constrained ? 5 : 14, duration: constrained ? 0.18 : 0.36, stagger: constrained ? 0.025 : 0.06, clearProps: 'transform' }, constrained ? 0.02 : 0.06)
      .from('[data-motion="archive-stats"] > *', { autoAlpha: 0, x: constrained ? 0 : 10, duration: constrained ? 0.16 : 0.28, stagger: constrained ? 0.03 : 0.055, clearProps: 'transform' }, constrained ? 0.06 : 0.24)
      .from(cards, { autoAlpha: 0, duration: constrained ? 0.18 : 0.32, stagger: constrained ? 0.04 : 0.08 }, constrained ? 0.08 : 0.3)

    cards.forEach((card, index) => {
      const position = (constrained ? 0.1 : 0.31) + index * (constrained ? 0.04 : 0.08)
      const media = card.querySelector<HTMLElement>('[data-motion="card-media"]')
      const cardIndex = card.querySelector<HTMLElement>('[data-motion="card-index"]')
      const copyItems = card.querySelectorAll<HTMLElement>('[data-motion="card-copy"] > *')
      if (media) timeline.from(media, { autoAlpha: constrained ? 1 : 0.68, scale: constrained ? 1 : 1.055, duration: constrained ? 0.18 : 0.58, clearProps: 'opacity,visibility,transform' }, position)
      if (cardIndex) timeline.from(cardIndex, { autoAlpha: 0, scale: constrained ? 1 : 0.72, duration: constrained ? 0.14 : 0.26, clearProps: 'transform' }, position + (constrained ? 0 : 0.05))
      if (copyItems.length) timeline.from(copyItems, { autoAlpha: 0, x: constrained ? 0 : 16, duration: constrained ? 0.18 : 0.34, stagger: constrained ? 0.02 : 0.045, clearProps: 'transform' }, position + (constrained ? 0.02 : 0.09))
    })
  })
}
async function loadExhibits() {
  try {
    items.value = await apiGet<ExhibitCard[]>('/exhibits')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : (locale.value === 'en-US' ? 'Digital exhibits could not be loaded.' : '数字展项加载失败。')
  } finally {
    loading.value = false
    await nextTick()
    revealExhibits()
  }
}
onMounted(loadExhibits)
onBeforeUnmount(() => gsapContext?.revert())
</script>
<template>
  <main ref="root" class="curation-page exhibits-page" data-motion-page="exhibits">
    <svg class="river-route exhibit-route" viewBox="0 0 1200 500" preserveAspectRatio="none" aria-hidden="true"><path d="M0 430c139-135 231 27 399-124s184-42 335-155 259-46 466-226" /></svg>
    <section class="exhibits-intro" data-glass="light">
      <div class="exhibits-intro__index" data-motion="archive-index"><span>DIGITAL ARCHIVE</span><b>01</b><small>ONLINE GALLERY</small></div>
      <div class="exhibits-intro__copy" data-motion="archive-copy"><p class="eyebrow">DIGITAL EXHIBITION</p><h1>{{ copy.title }}</h1><p>{{ copy.intro }}</p></div>
      <div class="exhibit-stats" data-motion="archive-stats"><span>{{ copy.interaction }}</span><span>{{ copy.interactionDetail }}</span></div>
    </section>
    <InlineStatus v-if="error" kind="error" :message="`${error} ${copy.retry}`" />
    <LoadingSkeleton v-if="loading" :lines="4" :label="copy.loading" />
    <section v-else-if="items.length===0" class="state-panel state-panel--action"><div aria-hidden="true">◇</div><h2>{{ copy.emptyTitle }}</h2><p>{{ copy.emptyText }}</p><RouterLink to="/explore">{{ copy.explore }}</RouterLink></section>
    <section v-else class="exhibit-grid" :aria-label="copy.list"><RouterLink v-for="(item, index) in items" :key="item.slug" data-motion="item" v-pointer-surface="{ kind: 'exhibit', maxTilt: 1.15 }" :to="`/exhibits/${item.slug}`"><span class="exhibit-card-index" data-motion="card-index">0{{ index + 1 }}</span><img data-motion="card-media" :src="coverFor(item)" :alt="displayItem(item).title" loading="lazy" decoding="async" /><div data-motion="card-copy"><p class="card-meta">{{ copy.related }} · {{ displayItem(item).artifactTitle }}</p><h2>{{ displayItem(item).title }}</h2><p>{{ displayItem(item).summary }}</p><span>{{ copy.start }} <b>→</b></span></div></RouterLink></section>
  </main>
</template>
