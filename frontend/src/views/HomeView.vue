<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { gsap } from 'gsap'
import { motion } from 'motion-v'
import { RouterLink } from 'vue-router'
import { ArrowRight, Calendar, Collection, DataBoard } from '@element-plus/icons-vue'
import { useLocale } from '../stores/locale'
import FluidButton from '../components/FluidButton.vue'
import { createGsapContext, isConstrainedGsapReveal, shouldRunGsapReveal } from '../lib/gsap'

const { locale, t } = useLocale()
const root = ref<HTMLElement | null>(null)
let gsapContext: gsap.Context | undefined
const copy = computed(() => locale.value === 'zh-CN'
  ? {
      title: '从河洛文明，\n一件器物开始。',
      intro: '面向年轻文化探索者，在线探索馆藏故事与数字展项，计划一次属于你的到访。',
      routeLabel: '参观路线',
      route: ['探索馆藏', '进入数字展厅', '预约参观'],
      curation: '策展手记',
      note: '沿着河流阅读文明',
      location: '洛阳 · 河洛文明主题展厅', curationLink: '查看策展', mapAria: '参观路线示意', routes: ['经典路线', '亲子路线', '学术路线'],
      nextEyebrow: '探索河洛', nextTitle: '让传统文化，成为今天的灵感。',
    }
  : {
      title: 'Start with one object,\nenter Heluo civilization.',
      intro: 'Explore collections and digital exhibits before planning your visit.',
      routeLabel: 'Visitor routes',
      route: ['Explore collection', 'Enter digital gallery', 'Book a visit'],
      curation: 'Today\'s curation',
      note: 'Ritual vessels · source of civilization',
      location: 'Luoyang · Heluo Civilization Gallery', curationLink: 'View curation', mapAria: 'Visitor route map', routes: ['Classic route', 'Family route', 'Research route'],
      nextEyebrow: 'EXPLORE HELUO', nextTitle: 'Let tradition inspire life today.',
    })
const titleLines = computed(() => copy.value.title.split('\n'))

const featureCards = computed(() => locale.value === 'zh-CN'
  ? [
      { index: '01', title: '青铜礼器', text: '礼乐承载，制度与信仰', image: '/media/editorial/hero-bronze-ding.webp', to: '/explore' },
      { index: '02', title: '玉石意象', text: '温润致远，观念与美学', image: '/media/exhibits/jade-bi-cover.webp', to: '/explore' },
      { index: '03', title: '河洛故事', text: '从地理到文脉，河洛的千年流转', image: '/media/exhibits/river-map-stone-cover.webp', to: '/explore' },
    ]
  : [
      { index: '01', title: 'Bronze rituals', text: 'Ritual order and belief', image: '/media/editorial/hero-bronze-ding.webp', to: '/explore' },
      { index: '02', title: 'Jade imagery', text: 'Ideas and aesthetics', image: '/media/exhibits/jade-bi-cover.webp', to: '/explore' },
      { index: '03', title: 'Heluo stories', text: 'A river of cultural memory', image: '/media/exhibits/river-map-stone-cover.webp', to: '/explore' },
    ])

function revealHome() {
  if (!shouldRunGsapReveal() || !root.value) return
  gsapContext?.revert()
  gsapContext = createGsapContext(root.value, () => {
    const constrained = isConstrainedGsapReveal()
    const shortDistance = constrained ? 4 : 9
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    timeline
      .from('[data-motion="hero-veil"]', { autoAlpha: 0, duration: constrained ? 0.18 : 0.48 }, 0)
      .from('[data-motion="intro-eyebrow"]', { autoAlpha: 0, y: shortDistance, duration: constrained ? 0.16 : 0.3 }, 0)
      .from('[data-motion="intro-title"]', { autoAlpha: 0, duration: constrained ? 0.1 : 0.18 }, constrained ? 0.04 : 0.07)
      .from('[data-motion="intro-title-line"]', {
        yPercent: constrained ? 18 : 112,
        rotation: constrained ? 0 : 1.2,
        transformOrigin: 'left bottom',
        duration: constrained ? 0.18 : 0.52,
        stagger: constrained ? 0.03 : 0.075,
        clearProps: 'transform',
      }, constrained ? 0.04 : 0.08)
      .from('[data-motion="intro-copy"]', { autoAlpha: 0, y: shortDistance, duration: constrained ? 0.18 : 0.34 }, constrained ? 0.1 : 0.31)
      .from('[data-motion="routes-shell"]', { autoAlpha: 0, scale: constrained ? 1 : 0.985, transformOrigin: 'right center', duration: constrained ? 0.18 : 0.38, clearProps: 'transform' }, constrained ? 0.1 : 0.28)
      .from('[data-motion="route-label"]', { autoAlpha: 0, x: constrained ? 0 : 10, duration: constrained ? 0.14 : 0.24 }, constrained ? 0.12 : 0.37)
      .from('[data-motion="route"]', { autoAlpha: 0, y: shortDistance, duration: constrained ? 0.18 : 0.34, stagger: constrained ? 0.035 : 0.065, clearProps: 'transform' }, constrained ? 0.14 : 0.42)
      .from('[data-motion="route-icon"]', { autoAlpha: 0, scale: constrained ? 1 : 0.72, rotation: constrained ? 0 : -12, duration: constrained ? 0.14 : 0.28, stagger: constrained ? 0.035 : 0.065, clearProps: 'transform' }, constrained ? 0.15 : 0.47)
      .from('[data-motion="location"]', { autoAlpha: 0, x: constrained ? 4 : 12, duration: constrained ? 0.16 : 0.28 }, constrained ? 0.17 : 0.68)
  })
}

onMounted(async () => {
  await nextTick()
  revealHome()
})

onBeforeUnmount(() => gsapContext?.revert())
</script>

<template>
  <main ref="root" class="corridor-home" data-motion-page="home" aria-labelledby="home-title">
    <section class="corridor-home__hero">
      <div class="corridor-home__veil" data-motion="hero-veil" aria-hidden="true"></div>
      <div class="corridor-home__title-block">
        <p class="corridor-home__eyebrow" data-motion="intro-eyebrow">HELUO DIGITAL MUSEUM · 2026</p>
        <h1 id="home-title" data-motion="intro-title" :class="{ 'is-english': locale === 'en-US' }"><span v-for="line in titleLines" :key="line" class="home-title-line"><span data-motion="intro-title-line">{{ line }}</span></span></h1>
        <p class="corridor-home__intro" data-motion="intro-copy">{{ copy.intro }}</p>
      </div>

      <nav class="corridor-home__routes" data-glass="dark" data-motion="routes-shell" :aria-label="copy.routeLabel">
        <p data-motion="route-label">{{ copy.routeLabel }} <span>ROUTES</span></p>
        <RouterLink data-motion="route" to="/explore"><i data-motion="route-icon" aria-hidden="true"><Collection /></i><span>{{ copy.route[0] }}</span><b><ArrowRight /></b></RouterLink>
        <RouterLink data-motion="route" to="/exhibits"><i data-motion="route-icon" aria-hidden="true"><DataBoard /></i><span>{{ copy.route[1] }}</span><b><ArrowRight /></b></RouterLink>
        <RouterLink data-motion="route" to="/appointment"><i data-motion="route-icon" aria-hidden="true"><Calendar /></i><span>{{ copy.route[2] }}</span><b><ArrowRight /></b></RouterLink>
      </nav>
      <span class="corridor-home__location" data-motion="location">{{ copy.location }}</span>
    </section>

    <motion.section class="corridor-home__curation home-experiences" :initial="{ opacity: 0, y: 8 }" :while-in-view="{ opacity: 1, y: 0 }" :viewport="{ once: true, amount: 0.3 }" :transition="{ duration: 0.35 }" aria-labelledby="curation-title">
      <div class="corridor-home__curation-heading" data-glass="dark"><p>{{ copy.curation }}</p><span>CURATION</span><small>2026 / 05 / 18</small><b id="curation-title">{{ copy.note }}</b><RouterLink to="/explore">{{ copy.curationLink }}　→</RouterLink></div>
      <RouterLink v-for="card in featureCards" :key="card.index" :to="card.to" class="corridor-home__object-card" data-glass="light" data-glass-interactive>
        <span>{{ card.index }}</span><img :src="card.image" :alt="card.title" loading="lazy" decoding="async" /><div><h2>{{ card.title }}</h2><p>{{ card.text }}</p></div>
      </RouterLink>
      <div class="corridor-home__map" data-glass="light" :aria-label="copy.mapAria"><p>{{ copy.routeLabel }} <span>ROUTES</span></p><svg viewBox="0 0 200 100" aria-hidden="true"><path d="M12 77C45 16 82 83 114 38s49 10 77-25"/><circle cx="12" cy="77" r="4"/><circle cx="114" cy="38" r="3"/><circle cx="191" cy="13" r="3"/></svg><RouterLink v-for="routeLabel in copy.routes" :key="routeLabel" to="/appointment">{{ routeLabel }}　→</RouterLink></div>
    </motion.section>

    <section class="corridor-home__next"><div><p>{{ copy.nextEyebrow }}</p><h2>{{ copy.nextTitle }}</h2></div><div class="corridor-home__next-actions"><FluidButton variant="primary" @click="$router.push('/explore')"><span class="home-cta__copy"><small>COLLECTION</small><strong>{{ t.start }}</strong></span><span class="home-cta__icon" aria-hidden="true"><ArrowRight /></span></FluidButton><FluidButton variant="secondary" @click="$router.push('/exhibits')"><span class="home-cta__copy"><small>DIGITAL GALLERY</small><strong>{{ t.enter }}</strong></span><span class="home-cta__icon" aria-hidden="true"><DataBoard /></span></FluidButton></div></section>
  </main>
</template>

