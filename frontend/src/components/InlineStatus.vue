<script setup lang="ts">
import { motion } from 'motion-v'

withDefaults(defineProps<{
  kind?: 'success' | 'error' | 'warning' | 'info'
  message?: string
  announce?: boolean
}>(), { kind: 'info', message: '', announce: true })
</script>

<template>
  <motion.p v-if="message" class="inline-status" :class="`inline-status--${kind}`" :data-state="kind" :role="announce ? (kind === 'error' ? 'alert' : 'status') : undefined" :aria-live="announce ? (kind === 'error' ? 'assertive' : 'polite') : undefined" :aria-hidden="announce ? undefined : 'true'" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :exit="{ opacity: 0 }" :transition="{ duration: 0.18 }"><i aria-hidden="true">{{ kind === 'success' ? '✓' : kind === 'error' ? '!' : kind === 'warning' ? '△' : 'i' }}</i><span>{{ message }}</span></motion.p>
</template>
