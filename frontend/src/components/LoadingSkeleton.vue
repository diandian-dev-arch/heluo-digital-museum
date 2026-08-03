<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; label?: string; compact?: boolean; variant?: 'page' | 'list' | 'form' }>(), { lines: 3, label: '正在加载内容', compact: false, variant: 'page' })
</script>

<template>
  <section class="loading-skeleton" :class="[`loading-skeleton--${variant}`, { 'loading-skeleton--compact': compact }]" role="status" :aria-label="label" aria-live="polite">
    <span class="sr-only">{{ label }}</span>
    <i class="loading-skeleton__title"></i>
    <i v-for="line in lines" :key="line" class="loading-skeleton__line" :style="{ width: `${100 - (line - 1) * 13}%` }"></i>
  </section>
</template>
