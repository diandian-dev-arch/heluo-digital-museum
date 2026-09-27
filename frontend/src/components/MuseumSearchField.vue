<script setup lang="ts">
import { computed, useId } from 'vue'
import { Close, Loading, Search } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  submitLabel?: string
  loadingLabel?: string
  clearLabel?: string
  loading?: boolean
  error?: string
  disabled?: boolean
}>(), {
  placeholder: '',
  submitLabel: '搜索',
  loadingLabel: '搜索中',
  clearLabel: '清除搜索',
  loading: false,
  error: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
  clear: []
}>()

const inputId = `museum-search-${useId()}`
const describedBy = computed(() => props.error ? `${inputId}-error` : undefined)

function clear() {
  if (props.disabled || props.loading) return
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <form class="museum-search-field" data-tactile-search :data-state="loading ? 'loading' : error ? 'error' : 'idle'" @submit.prevent="emit('submit')">
    <label class="museum-search-field__label" :for="inputId">{{ label }}</label>
    <div class="museum-search-field__control" :class="{ 'has-clear': Boolean(modelValue) }" data-glass="compact" data-tactile-field>
      <span class="museum-search-field__leading" aria-hidden="true"><Search /></span>
      <input
        :id="inputId"
        :value="modelValue"
        type="search"
        maxlength="100"
        autocomplete="off"
        enterkeyhint="search"
        :placeholder="placeholder"
        :disabled="disabled || loading"
        :aria-label="label"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :aria-busy="loading ? 'true' : undefined"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button v-if="modelValue" class="museum-search-field__clear" type="button" :aria-label="clearLabel" :disabled="disabled || loading" @click="clear">
        <Close aria-hidden="true" />
      </button>
      <button class="museum-search-field__submit" type="submit" data-tactile-button data-tactile-variant="primary" :disabled="disabled || loading">
        <Loading v-if="loading" class="is-loading" aria-hidden="true" />
        <span>{{ loading ? loadingLabel : submitLabel }}</span>
        <Search v-if="!loading" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" :id="`${inputId}-error`" class="museum-search-field__error" role="alert">{{ error }}</p>
  </form>
</template>
