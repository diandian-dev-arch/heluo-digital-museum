<script setup lang="ts">
import '../assets/public-responsive-polish.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, Calendar, DataBoard } from '@element-plus/icons-vue'
import { useLocale } from '../stores/locale'
import { useTheme } from '../stores/theme'
import PointerDotField from '../components/PointerDotField.vue'

const { locale } = useLocale()
const { isDark } = useTheme()
const root = ref<HTMLElement | null>(null)
let gsapContext: { revert: () => void } | undefined
let unmounted = false
const copy = computed(() => locale.value === 'zh-CN'
  ? {
      title: '河洛数字\n博物馆',
      intro: '面向年轻文化探索者，在线探索馆藏故事与数字展项，计划一次属于你的到访。',
      explore: '探索馆藏', gallery: '进入数字展厅', visit: '预约参观',
      curation: '策展手记',
      note: '沿着河流阅读文明',
      location: '洛阳 · 河洛文明主题展厅',
      closeLabel: '走近器物', closeTitle: '一鼎之间，\n细看青铜。',
      closeText: '鼎的双耳、器腹与三足，怎样组成一件器物的轮廓？先从正面观察，再换个角度看看支撑与纹样的变化。这件数字重制作品以克利夫兰艺术博物馆公开模型为基础。读完三个观察提示，再进入互动展项，分辨原件资料与数字呈现之间的边界。',
      closeNote: '青铜鼎意象 · 数字策展配图', closeAction: '阅读青铜鼎故事',
      themesIntro: '从礼器、玉石与河流，读懂不同的河洛故事。',
      visitTitle: '把探索，延伸到下一站。', visitText: '查看日期、时段与参观须知，安排你的参观计划。',
    }
  : {
      title: 'Heluo Digital\nMuseum',
      intro: 'Explore collections and digital exhibits before planning your visit.',
      explore: 'Explore collection', gallery: 'Digital galleries', visit: 'Book a visit',
      curation: 'Today\'s curation',
      note: 'Ritual vessels · source of civilization',
      location: 'Luoyang · Heluo Civilization Gallery',
      closeLabel: 'A closer look', closeTitle: 'A vessel.\nA new perspective.',
      closeText: 'How do the handles, body and three legs shape a ding? Start from the front, then change your viewpoint to examine its supports and patterns. This digital reworking uses an open model from the Cleveland Museum of Art. Read three observation prompts before entering the interactive exhibit, with the original object and this digital presentation clearly distinguished.',
      closeNote: 'Bronze ding imagery · Editorial illustration', closeAction: 'Read the ding story',
      themesIntro: 'Discover Heluo through ritual vessels, jade and the river.',
      visitTitle: 'Take your curiosity further.', visitText: 'Find dates, visiting times and practical information for your visit.',
    })
const titleLines = computed(() => copy.value.title.split('\n'))
const heroMedia = computed(() => isDark.value
  ? {
      src: '/media/editorial/home-corridor-dark-user-v2.webp',
      srcset: '/media/editorial/home-corridor-dark-user-v2-640w.webp 640w, /media/editorial/home-corridor-dark-user-v2-1280w.webp 1280w, /media/editorial/home-corridor-dark-user-v2.webp 1672w',
      mobileSrcset: '/media/editorial/home-corridor-dark-user-v2-portrait.webp 483w',
    }
  : {
      src: '/media/editorial/home-corridor-light-user-v2.webp',
      srcset: '/media/editorial/home-corridor-light-user-v2-640w.webp 640w, /media/editorial/home-corridor-light-user-v2-1280w.webp 1280w, /media/editorial/home-corridor-light-user-v2.webp 1672w',
      mobileSrcset: '/media/editorial/home-corridor-light-user-v2-portrait.webp 483w',
    })

const featureCards = computed(() => locale.value === 'zh-CN'
  ? [
      { index: '01', title: '青铜礼器', text: '礼乐承载，制度与信仰', image: '/media/editorial/hero-bronze-ding-home-384w-v1.webp', srcset: '/media/editorial/hero-bronze-ding-home-192w-v1.webp 192w, /media/editorial/hero-bronze-ding-home-384w-v1.webp 384w, /media/editorial/hero-bronze-ding-home-640w-v1.webp 640w', to: '/explore' },
      { index: '02', title: '玉石意象', text: '温润致远，观念与美学', image: '/media/exhibits/jade-bi-home-384w-v1.webp', srcset: '/media/exhibits/jade-bi-home-192w-v1.webp 192w, /media/exhibits/jade-bi-home-384w-v1.webp 384w, /media/exhibits/jade-bi-home-640w-v1.webp 640w', to: '/explore' },
      { index: '03', title: '河洛故事', text: '从地理到文脉，河洛的千年流转', image: '/media/editorial/heluo-river-map-home-384w-v1.webp', srcset: '/media/editorial/heluo-river-map-home-192w-v1.webp 192w, /media/editorial/heluo-river-map-home-384w-v1.webp 384w, /media/editorial/heluo-river-map-home-640w-v1.webp 640w', to: '/explore' },
    ]
  : [
      { index: '01', title: 'Bronze rituals', text: 'Ritual order and belief', image: '/media/editorial/hero-bronze-ding-home-384w-v1.webp', srcset: '/media/editorial/hero-bronze-ding-home-192w-v1.webp 192w, /media/editorial/hero-bronze-ding-home-384w-v1.webp 384w, /media/editorial/hero-bronze-ding-home-640w-v1.webp 640w', to: '/explore' },
      { index: '02', title: 'Jade imagery', text: 'Ideas and aesthetics', image: '/media/exhibits/jade-bi-home-384w-v1.webp', srcset: '/media/exhibits/jade-bi-home-192w-v1.webp 192w, /media/exhibits/jade-bi-home-384w-v1.webp 384w, /media/exhibits/jade-bi-home-640w-v1.webp 640w', to: '/explore' },
      { index: '03', title: 'Heluo stories', text: 'A river of cultural memory', image: '/media/editorial/heluo-river-map-home-384w-v1.webp', srcset: '/media/editorial/heluo-river-map-home-192w-v1.webp 192w, /media/editorial/heluo-river-map-home-384w-v1.webp 384w, /media/editorial/heluo-river-map-home-640w-v1.webp 640w', to: '/explore' },
    ])

function shouldLoadHomeGsap() {
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return document.documentElement.dataset.performanceTier === 'full'
    && document.documentElement.dataset.motionTier === 'full'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

async function revealHome() {
  const scope = root.value
  if (!scope || !shouldLoadHomeGsap()) return
  const gsapModule = await import('gsap').catch(() => undefined)
  if (!gsapModule) return
  const { gsap } = gsapModule
  if (unmounted || root.value !== scope || !shouldLoadHomeGsap()) return
  gsapContext?.revert()
  gsapContext = gsap.context(() => {
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    timeline
      .from('[data-motion="hero-veil"]', { autoAlpha: 0, duration: 0.48 }, 0)
      .from('[data-motion="intro-eyebrow"]', { autoAlpha: 0, y: 9, duration: 0.3 }, 0)
      .from('[data-motion="intro-title"]', { autoAlpha: 0, duration: 0.18 }, 0.07)
      .from('[data-motion="intro-title-line"]', {
        yPercent: 112,
        rotation: 1.2,
        transformOrigin: 'left bottom',
        duration: 0.52,
        stagger: 0.075,
        clearProps: 'transform',
      }, 0.08)
      .from('[data-motion="intro-copy"]', { autoAlpha: 0, y: 9, duration: 0.34 }, 0.31)
      .from('[data-motion="intro-cta"]', {
        autoAlpha: 0,
        y: 9,
        duration: 0.32,
        clearProps: 'transform',
      }, 0.38)
      .from('[data-motion="location"]', { autoAlpha: 0, y: 8, duration: 0.24 }, 0.5)
  }, scope)
}

onMounted(async () => {
  await nextTick()
  void revealHome()
})

onBeforeUnmount(() => {
  unmounted = true
  gsapContext?.revert()
})
</script>

<template>
  <section ref="root" class="corridor-home museum-home" data-motion-page="home" aria-labelledby="home-title">
    <section class="home-cover">
      <picture><source media="(max-width: 760px)" :srcset="heroMedia.mobileSrcset" sizes="100vw" /><img class="corridor-home__hero-media" :src="heroMedia.src" :srcset="heroMedia.srcset" sizes="100vw" width="1672" height="941" alt="" fetchpriority="high" decoding="async" /></picture>
      <div class="home-cover__veil" data-motion="hero-veil" aria-hidden="true"></div>
      <PointerDotField variant="image" />
      <div class="home-cover__copy">
        <p class="home-eyebrow" data-motion="intro-eyebrow">{{ locale === 'en-US' ? 'One object, a living story' : '从一件器物，走进河洛文明' }}</p>
        <h1 id="home-title" data-motion="intro-title" :class="{ 'is-english': locale === 'en-US' }"><span v-for="line in titleLines" :key="line" class="home-title-line"><span data-motion="intro-title-line">{{ line }}</span></span></h1>
        <p class="home-cover__intro" data-motion="intro-copy">{{ copy.intro }}</p>
        <div class="home-cover__actions" data-motion="intro-cta">
          <RouterLink class="home-primary" to="/explore">{{ copy.explore }}<ArrowRight aria-hidden="true" /></RouterLink>
          <RouterLink class="home-link" to="/exhibits">{{ copy.gallery }}<ArrowRight aria-hidden="true" /></RouterLink>
        </div>
      </div>
      <div class="home-cover__foot" data-motion="location"><span>{{ copy.location }}</span><RouterLink class="home-link" to="/appointment"><Calendar aria-hidden="true" />{{ copy.visit }}</RouterLink></div>
    </section>

    <section class="home-closeup home-content" aria-labelledby="closeup-title">
      <figure class="home-closeup__figure">
        <img src="/media/editorial/hero-bronze-ding-home-640w-v1.webp" srcset="/media/editorial/hero-bronze-ding-home-384w-v1.webp 384w, /media/editorial/hero-bronze-ding-home-640w-v1.webp 640w" sizes="(max-width: 760px) calc(100vw - 40px), 480px" width="640" height="640" :alt="copy.closeNote" loading="lazy" decoding="async" />
        <figcaption>{{ copy.closeNote }}</figcaption>
      </figure>
      <div class="home-closeup__copy"><p class="home-eyebrow">{{ copy.closeLabel }}</p><h2 id="closeup-title">{{ copy.closeTitle }}</h2><p>{{ copy.closeText }}</p><RouterLink class="home-link" to="/artifacts/heluo-bronze-ding"><DataBoard aria-hidden="true" />{{ copy.closeAction }}<ArrowRight aria-hidden="true" /></RouterLink></div>
    </section>

    <section class="home-themes home-content" aria-labelledby="curation-title">
      <header class="home-section-heading"><div><p class="home-eyebrow">{{ copy.curation }}</p><h2 id="curation-title">{{ copy.note }}</h2></div><p>{{ copy.themesIntro }}</p></header>
      <div class="home-themes__grid"><RouterLink v-for="card in featureCards" :key="card.index" :to="{ path: card.to, query: { category: ({ '01': 'BRONZE', '02': 'JADE', '03': 'RIVER' } as Record<string, string>)[card.index] } }" class="home-theme">
        <div class="home-theme__media"><img :src="card.image" :srcset="card.srcset" sizes="(max-width: 760px) 112px, (max-width: 1100px) 30vw, 380px" width="384" height="384" alt="" loading="lazy" decoding="async" /></div><div class="home-theme__copy"><h3>{{ card.title }}</h3><p>{{ card.text }}</p></div><ArrowRight aria-hidden="true" />
      </RouterLink></div>
    </section>
    <section class="home-visit home-content"><div><h2>{{ copy.visitTitle }}</h2><p>{{ copy.visitText }}</p></div><RouterLink class="home-link" to="/appointment"><Calendar aria-hidden="true" />{{ copy.visit }}<ArrowRight aria-hidden="true" /></RouterLink></section>
  </section>
</template>

<style scoped>
/* Home owns composition. Theme colours and interaction semantics stay shared. */
.museum-home { --home-canvas: var(--theme-surface-canvas); color: var(--theme-text); background: var(--home-canvas); }
:global(html[data-theme="dark"]) .museum-home { --home-canvas: oklch(8% .014 170); }
.museum-home svg { width: 20px; height: 20px; flex-shrink: 0; }
.home-content { width: min(calc(100% - 6rem), 1200px); margin-inline: auto; }
.home-cover { position: relative; isolation: isolate; display: flex; flex-direction: column; justify-content: space-between; min-height: clamp(800px, 90svh, 1040px); overflow: hidden; background: var(--theme-surface-section); }
.home-cover::after { position: absolute; z-index: 1; inset: auto 0 0; height: 180px; background: linear-gradient(to bottom, transparent, var(--home-canvas)); content: ''; pointer-events: none; }
.home-cover__copy, .home-cover__foot { z-index: 2; }
.home-cover :deep(.pointer-dot-field) { mask-image: linear-gradient(to bottom, #000 65%, transparent 100%); }
.home-cover .corridor-home__hero-media { position: absolute; z-index: -2; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.home-cover__veil { position: absolute; z-index: -1; inset: 0; pointer-events: none; background: linear-gradient(90deg, color-mix(in srgb, var(--theme-surface-canvas) 94%, transparent), color-mix(in srgb, var(--theme-surface-canvas) 60%, transparent) 29%, transparent 59%), linear-gradient(0deg, color-mix(in srgb, var(--theme-surface-canvas) 86%, transparent), transparent 18%); }
.home-cover__copy { width: min(40%, 480px); margin-left: max(3rem, calc((100% - 1200px) / 2)); padding-block: var(--space-20) var(--space-12); }
.home-eyebrow { margin: 0 0 var(--space-6); color: var(--theme-action); font: 500 .875rem/1.6 var(--font-body); }
.home-cover h1 { margin: 0; color: var(--theme-text-strong); font: 400 4rem/1.2 var(--font-display); letter-spacing: 0; }
.home-cover h1.is-english { font-size: 3.5rem; }
.home-cover .home-title-line { display: block; overflow: hidden; }
.home-cover .home-title-line > span { display: block; }
.home-cover__intro { max-width: 24rem; margin: var(--space-6) 0; font-size: 1rem; line-height: 1.8; color: var(--theme-text); }
html[data-theme="dark"] .home-cover__intro { color: var(--theme-text-strong); }
.home-cover__actions { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-6); align-items: center; }
.home-primary, .home-link { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-3); min-height: 48px; max-width: 100%; font: 500 .9375rem/1.5 var(--font-body); text-decoration: none; transition: color 160ms ease-out, background-color 160ms ease-out; }
.home-primary { padding: var(--space-3) var(--space-6); border: 1px solid var(--theme-primary-surface); border-radius: var(--theme-control-radius); color: var(--theme-primary-text); background: var(--theme-primary-surface); }
.home-primary:hover { background: var(--theme-primary-surface-hover); }
.home-link { color: var(--theme-action); padding-block: var(--space-2); }
.home-link:hover { text-decoration: underline; text-underline-offset: 6px; }
.home-cover__actions > .home-link { padding: var(--space-2) var(--space-3); border-radius: var(--theme-control-radius); background: var(--theme-surface-content); }
.home-cover__foot > .home-link { color: var(--theme-text-strong); }
.museum-home a:focus-visible { outline: 2px solid var(--theme-focus); outline-offset: 5px; }
.home-cover__foot { position: relative; display: flex; justify-content: space-between; align-items: center; gap: var(--space-6); width: min(calc(100% - 6rem), 1200px); margin: 0 auto; padding-block: var(--space-4); font-size: .875rem; color: var(--theme-text-strong); }
.home-closeup { display: grid; grid-template-columns: minmax(0, 480px) minmax(0, 1fr); gap: clamp(3rem, 7vw, 7rem); align-items: center; padding-block: var(--space-12) var(--space-20); }
.home-closeup__figure { position: relative; margin: 0; min-width: 0; overflow: hidden; background: var(--theme-surface-section); border-radius: var(--theme-card-radius); }
.home-closeup__figure img { display: block; width: 100%; height: auto; max-height: 400px; aspect-ratio: 6 / 5; object-fit: contain; padding: 0; }
.home-closeup__figure figcaption { margin: 0; padding: var(--space-4) var(--space-6); color: var(--theme-text-muted); font-size: .8125rem; line-height: 1.6; }
.home-closeup__copy h2 { margin: 0 0 var(--space-6); font: 400 2.75rem/1.3 var(--font-display); white-space: pre-line; color: var(--theme-text-strong); }
.home-closeup__copy > p:not(.home-eyebrow) { margin-bottom: var(--space-6); font-size: 1rem; line-height: 1.85; }
.home-themes { padding-bottom: var(--space-24); }
.home-section-heading { display: flex; justify-content: space-between; align-items: end; gap: var(--space-8); margin-bottom: var(--space-8); }
.home-section-heading .home-eyebrow { margin-bottom: var(--space-3); }
.home-section-heading h2 { margin: 0; color: var(--theme-text-strong); font: 400 2rem/1.4 var(--font-display); }
.home-section-heading > p { max-width: 28rem; margin: 0; color: var(--theme-text-muted); font-size: .9375rem; line-height: 1.8; }
.home-themes__grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: var(--space-8); }
.home-theme { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; align-content: start; gap: var(--space-4); color: var(--theme-text); }
.home-theme__media { grid-column: 1 / -1; height: clamp(180px, 24vw, 300px); overflow: hidden; border-radius: var(--theme-control-radius); background: var(--theme-surface-section); }
.home-theme__media img { height: 100%; width: 100%; object-fit: contain; transition: transform 240ms var(--ease-out); }
.home-theme__copy h3 { margin: 0 0 var(--space-2); font: 500 1.5rem/1.4 var(--font-display); color: var(--theme-text-strong); }
.home-theme__copy p { margin: 0; font-size: .9375rem; line-height: 1.7; color: var(--theme-text-muted); }
.home-theme > svg { margin-top: var(--space-2); color: var(--theme-action); }
.home-visit { display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); padding-block: var(--space-12) var(--space-20); border-top: 1px solid var(--theme-border); }
.home-visit h2 { margin-bottom: var(--space-3); font: 400 1.75rem/1.4 var(--font-display); color: var(--theme-text-strong); }
.home-visit p { margin: 0; font-size: .9375rem; line-height: 1.8; color: var(--theme-text-muted); }
.home-visit > a { flex-shrink: 0; }
@media (hover: hover) and (pointer: fine) { .home-theme:hover img { transform: scale(1.025); } }
@media (max-width: 1100px) {
  .home-content, .home-cover__foot { width: calc(100% - 4rem); }
  .home-cover__copy { margin-left: var(--space-8); width: 44%; }
  .home-cover h1, .home-cover h1.is-english { font-size: 3rem; }
  .home-closeup { gap: var(--space-12); }
  .home-closeup__copy h2 { font-size: 2.25rem; }
}
@media (max-width: 760px) {
  .home-content { width: calc(100% - 2.5rem); }
  .home-cover { min-height: 0; }
  .home-cover .corridor-home__hero-media { inset: 0; height: 100%; object-position: center 48%; }
  .home-cover__veil { background: linear-gradient(180deg, var(--theme-surface-canvas), color-mix(in srgb, var(--theme-surface-canvas) 88%, transparent) 33%, transparent 60%, color-mix(in srgb, var(--theme-surface-canvas) 96%, transparent)); }
  .home-cover__copy { width: auto; margin: 0 var(--space-6); padding: var(--space-8) 0 0; }
  .home-eyebrow { margin-bottom: var(--space-4); font-size: .875rem; }
  .home-cover h1, .home-cover h1.is-english { font-size: 2.25rem; line-height: 1.2; }
  .home-cover__intro { max-width: 30rem; margin: var(--space-4) 0; font-size: .9375rem; }
  /* Leave the central exhibit visible; place entry actions below its plinth. */
  .home-cover__actions { gap: var(--space-3) var(--space-4); padding-block: 208px 32px; }
  .home-primary, .home-link { font-size: .875rem; }
  .home-primary { padding-inline: var(--space-4); }
  .home-cover__foot { width: calc(100% - 3rem); flex-wrap: wrap; gap: var(--space-2); padding-block: var(--space-2) var(--space-4); }
  .home-cover__foot > span { font-size: .8125rem; }
  .home-closeup { grid-template-columns: 1fr; gap: var(--space-8); padding-block: var(--space-12); }
  .home-closeup__figure img { max-height: 320px; padding: 0; }
  .home-closeup__figure figcaption { padding-inline: var(--space-6); }
  .home-closeup__copy h2 { font-size: 2rem; }
  .home-closeup__copy > p:not(.home-eyebrow) { font-size: 1rem; }
  .home-section-heading { align-items: start; flex-direction: column; gap: var(--space-4); margin-bottom: var(--space-6); }
  .home-section-heading h2 { font-size: 1.75rem; }
  .home-themes { padding-bottom: var(--space-12); }
  .home-themes__grid { grid-template-columns: 1fr; gap: var(--space-6); }
  .home-theme { grid-template-columns: 112px minmax(0, 1fr) 20px; align-items: center; gap: var(--space-4); }
  .home-theme__media { grid-column: auto; height: auto; aspect-ratio: 1; }
  .home-theme__copy h3 { font-size: 1.25rem; }
  .home-theme__copy p { font-size: .875rem; }
  .home-theme > svg { margin: 0; }
  .home-visit { flex-direction: column; align-items: start; padding-block: var(--space-8) var(--space-12); gap: var(--space-4); }
}
@media (max-width: 360px) {
  .home-content { width: calc(100% - 2rem); }
  .home-cover__copy { margin-inline: var(--space-4); }
  .home-cover__actions { flex-direction: column; align-items: start; gap: 0; }
  .home-theme { grid-template-columns: 88px minmax(0, 1fr) 20px; gap: var(--space-3); }
}
@media (prefers-reduced-motion: reduce) { .museum-home * { transition: none; } .home-theme:hover img { transform: none; } }
@media (forced-colors: active) { .home-cover__veil { background: Canvas; } .home-primary { border-color: ButtonText; } }
</style>

