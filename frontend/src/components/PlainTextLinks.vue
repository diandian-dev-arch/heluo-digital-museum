<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()
const parts = computed(() => {
  const result: { text: string; href?: string }[] = []
  const expression = /https?:\/\/[^\s<>"'，。；！？、【】]+/giu
  let cursor = 0
  for (const match of props.text.matchAll(expression)) {
    const start = match.index
    const candidate = match[0].replace(/[.,;!?)\]）]+$/u, '')
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) continue
      if (start > cursor) result.push({ text: props.text.slice(cursor, start) })
      result.push({ text: candidate, href: url.href })
      cursor = start + candidate.length
    } catch { /* Invalid URLs remain plain, escaped Vue text. */ }
  }
  if (cursor < props.text.length) result.push({ text: props.text.slice(cursor) })
  return result
})
</script>

<template>
  <span><template v-for="(part, index) in parts" :key="index"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer" class="plain-text-source-link">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></span>
</template>

<style scoped>
.plain-text-source-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 0.18em;
  overflow-wrap: anywhere;
}
.plain-text-source-link:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
</style>
