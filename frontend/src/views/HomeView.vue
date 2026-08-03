<script setup lang="ts">
import { computed } from 'vue'
import { motion } from 'motion-v'
import { RouterLink } from 'vue-router'
import { useLocale } from '../stores/locale'
import FluidButton from '../components/FluidButton.vue'

const { locale, t } = useLocale()
const copy = computed(() => locale.value === 'zh-CN'
  ? {
      title: '从河洛文明，\n一件器物开始。',
      intro: '面向年轻文化探索者，在线探索馆藏故事与数字展项，计划一次属于你的到访。',
      routeLabel: '参观路线',
      route: ['探索馆藏', '进入数字展厅', '预约参观'],
      curation: '策展手记',
      note: '沿着河流阅读文明',
    }
  : {
      title: 'Start with one object,\nenter Heluo civilization.',
      intro: 'Explore collections and digital exhibits before planning your visit.',
      routeLabel: 'Visitor routes',
      route: ['Explore collection', 'Enter digital gallery', 'Book a visit'],
      curation: 'Today\'s curation',
      note: 'Ritual vessels · source of civilization',
    })

const featureCards = computed(() => locale.value === 'zh-CN'
  ? [
      { index: '01', title: '青铜礼器', text: '礼乐承载，制度与信仰', image: '/media/exhibits/heluo-bronze-ding-v5.2-cover.webp', to: '/explore' },
      { index: '02', title: '玉石意象', text: '温润致远，观念与美学', image: '/media/exhibits/jade-bi-cover.webp', to: '/explore' },
      { index: '03', title: '河洛故事', text: '从地理到文脉，河洛的千年流转', image: '/media/exhibits/river-map-stone-cover.webp', to: '/explore' },
    ]
  : [
      { index: '01', title: 'Bronze rituals', text: 'Ritual order and belief', image: '/media/exhibits/heluo-bronze-ding-v5.2-cover.webp', to: '/explore' },
      { index: '02', title: 'Jade imagery', text: 'Ideas and aesthetics', image: '/media/exhibits/jade-bi-cover.webp', to: '/explore' },
      { index: '03', title: 'Heluo stories', text: 'A river of cultural memory', image: '/media/exhibits/river-map-stone-cover.webp', to: '/explore' },
    ])
</script>

<template>
  <main class="corridor-home" aria-labelledby="home-title">
    <section class="corridor-home__hero">
      <div class="corridor-home__veil" aria-hidden="true"></div>
      <div class="corridor-home__title-block">
        <p class="corridor-home__eyebrow">HELUO DIGITAL MUSEUM · 2026</p>
        <h1 id="home-title" :class="{ 'is-english': locale === 'en-US' }">{{ copy.title }}</h1>
        <p class="corridor-home__intro">{{ copy.intro }}</p>
      </div>

      <nav class="corridor-home__routes" :aria-label="copy.routeLabel">
        <p>{{ copy.routeLabel }} <span>ROUTES</span></p>
        <RouterLink to="/explore"><i aria-hidden="true">◇</i>{{ copy.route[0] }} <b>→</b></RouterLink>
        <RouterLink to="/exhibits"><i aria-hidden="true">▱</i>{{ copy.route[1] }} <b>→</b></RouterLink>
        <RouterLink to="/appointment"><i aria-hidden="true">□</i>{{ copy.route[2] }} <b>→</b></RouterLink>
      </nav>
      <span class="corridor-home__location">洛阳 · 河洛文明主题展厅</span>
    </section>

    <motion.section class="corridor-home__curation home-experiences" :initial="{ opacity: 0, y: 8 }" :while-in-view="{ opacity: 1, y: 0 }" :viewport="{ once: true, amount: 0.3 }" :transition="{ duration: 0.35 }" aria-labelledby="curation-title">
      <div class="corridor-home__curation-heading"><p>{{ copy.curation }}</p><span>CURATION</span><small>2026 / 05 / 18</small><b id="curation-title">{{ copy.note }}</b><RouterLink to="/explore">查看策展　→</RouterLink></div>
      <RouterLink v-for="card in featureCards" :key="card.index" :to="card.to" class="corridor-home__object-card">
        <span>{{ card.index }}</span><img :src="card.image" :alt="card.title" loading="lazy" decoding="async" /><div><h2>{{ card.title }}</h2><p>{{ card.text }}</p></div>
      </RouterLink>
      <div class="corridor-home__map" aria-label="参观路线示意"><p>{{ copy.routeLabel }} <span>ROUTES</span></p><svg viewBox="0 0 200 100" aria-hidden="true"><path d="M12 77C45 16 82 83 114 38s49 10 77-25"/><circle cx="12" cy="77" r="4"/><circle cx="114" cy="38" r="3"/><circle cx="191" cy="13" r="3"/></svg><RouterLink to="/appointment">经典路线　→</RouterLink><RouterLink to="/appointment">亲子路线　→</RouterLink><RouterLink to="/appointment">学术路线　→</RouterLink></div>
    </motion.section>

    <section class="corridor-home__next"><div><p>探索河洛</p><h2>让传统文化，成为今天的灵感。</h2></div><div class="corridor-home__next-actions"><FluidButton variant="primary" @click="$router.push('/explore')">{{ t.start }}　→</FluidButton><FluidButton variant="secondary" @click="$router.push('/exhibits')">{{ t.enter }}　↗</FluidButton></div></section>
  </main>
</template>

