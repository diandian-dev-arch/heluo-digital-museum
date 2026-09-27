<script setup lang="ts">

withDefaults(defineProps<{
  kind?: 'success' | 'error' | 'warning' | 'info'
  message?: string
  announce?: boolean
}>(), { kind: 'info', message: '', announce: true })
</script>

<template>
  <p v-if="message" class="inline-status" :class="`inline-status--${kind}`" :data-state="kind" :role="announce ? (kind === 'error' ? 'alert' : 'status') : undefined" :aria-live="announce ? (kind === 'error' ? 'assertive' : 'polite') : undefined" :aria-hidden="announce ? undefined : 'true'"><i aria-hidden="true">{{ kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'warning' ? '△' : 'i' }}</i><span>{{ message }}</span></p>
</template>
