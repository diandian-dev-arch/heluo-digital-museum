<script setup lang="ts">
import { motion } from 'motion-v'

withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  state?: 'idle' | 'error' | 'success'
}>(), { type: 'button', disabled: false, loading: false, block: false, variant: 'primary', size: 'md', state: 'idle' })
</script>

<template>
  <motion.button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading"
    :aria-invalid="state === 'error' || undefined"
    :data-cursor="variant === 'danger' ? 'danger' : variant === 'primary' ? 'action' : 'link'"
    :data-state="loading ? 'loading' : state"
    :data-glass="variant === 'secondary' || variant === 'ghost' ? 'compact' : undefined"
    :data-glass-interactive="variant === 'secondary' || variant === 'ghost' ? '' : undefined"
    :class="['fluid-button', `fluid-button--${variant}`, `fluid-button--${size}`, { 'fluid-button--block': block }]"
    :while-press="{ scale: 0.98, y: 1 }"
    :transition="{ type: 'spring', stiffness: 500, damping: 42, mass: 0.9 }"
  ><span v-if="loading" class="fluid-button__spinner" aria-hidden="true"></span><span v-else-if="state === 'success'" aria-hidden="true">✓</span><span v-else-if="state === 'error'" aria-hidden="true">!</span><span class="fluid-button__label"><slot /></span></motion.button>
</template>
