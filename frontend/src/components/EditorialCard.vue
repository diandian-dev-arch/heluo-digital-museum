<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { mediaSrcset, mediaSizes } from '../lib/responsiveMedia'

withDefaults(defineProps<{
  variant?: 'artifact' | 'article' | 'exhibit' | 'product' | 'feature' | string
  index?: string | number
  interactive?: boolean
  to?: string
  mediaSrc?: string
  mediaAlt?: string
}>(), {
  variant: 'feature',
  index: undefined,
  interactive: true,
  to: undefined,
  mediaSrc: undefined,
  mediaAlt: '',
})
</script>

<template>
  <component
    :is="to ? RouterLink : 'article'"
    :to="to"
    class="editorial-card"
    :class="[`editorial-card--${variant}`, { 'editorial-card--interactive': interactive }]"
    data-galaxy-card
    data-tactile-card
    data-state="idle"
    :data-variant="variant"
    :aria-label="to ? undefined : mediaAlt || undefined"
  >
    <div v-if="$slots.media || mediaSrc" class="editorial-card__media">
      <slot name="media">
        <img v-if="mediaSrc" :src="mediaSrc" :srcset="mediaSrcset(mediaSrc)" :sizes="mediaSizes" :alt="mediaAlt" loading="lazy" decoding="async" />
      </slot>
      <span v-if="index !== undefined" class="editorial-card__index" data-glass="compact">{{ String(index).padStart(2, '0') }}</span>
    </div>
    <div class="editorial-card__body">
      <div v-if="$slots.meta" class="editorial-card__meta"><slot name="meta" /></div>
      <h3 v-if="$slots.title" class="editorial-card__title"><slot name="title" /></h3>
      <div v-if="$slots.summary" class="editorial-card__summary"><slot name="summary" /></div>
      <div v-if="$slots.action" class="editorial-card__action"><slot name="action" /></div>
    </div>
  </component>
</template>
