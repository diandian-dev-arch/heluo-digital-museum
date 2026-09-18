<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useLocale } from '../stores/locale'
const { locale } = useLocale()
</script>

<template>
  <section class="not-found-page">
    <img src="/media/exhibits/jade-bi-cover.webp" :alt="locale === 'en-US' ? 'Jade bi concept object' : '玉璧概念展品'" width="480" height="480" />
    <div>
      <p class="section-label">404</p>
      <h1>{{ locale === 'en-US' ? 'This page could not be found' : '这页内容暂未找到' }}</h1>
      <p>{{ locale === 'en-US' ? 'The address may have changed. Continue with the collection or return to the museum.' : '地址可能已变更。可以继续探索馆藏，或返回博物馆首页。' }}</p>
      <nav :aria-label="locale === 'en-US' ? 'Continue exploring' : '继续探索'">
        <RouterLink class="text-action" to="/explore">{{ locale === 'en-US' ? 'Explore collection' : '探索馆藏' }}</RouterLink>
        <RouterLink class="text-action" to="/">{{ locale === 'en-US' ? 'Museum home' : '返回首页' }}</RouterLink>
      </nav>
    </div>
  </section>
</template>
