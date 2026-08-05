<script setup lang="ts">
interface AdminTabOption {
  value: string
  label: string
}

const props = defineProps<{
  modelValue: string
  tabs: AdminTabOption[]
  label: string
  panelId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function tabId(value: string) {
  return `${props.panelId}-tab-${value}`
}

function select(value: string) {
  emit('update:modelValue', value)
}

function moveFocus(event: KeyboardEvent, index: number) {
  let nextIndex = index
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % props.tabs.length
  else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + props.tabs.length) % props.tabs.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = props.tabs.length - 1
  else return

  event.preventDefault()
  const next = props.tabs[nextIndex]
  if (!next) return
  select(next.value)
  const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')
  buttons?.[nextIndex]?.focus()
}
</script>

<template>
  <div class="admin-tabs" data-glass="compact" role="tablist" :aria-label="label">
    <button
      v-for="(item, index) in tabs"
      :id="tabId(item.value)"
      :key="item.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.value"
      :aria-controls="panelId"
      :tabindex="modelValue === item.value ? 0 : -1"
      :class="{ active: modelValue === item.value }"
      @click="select(item.value)"
      @keydown="moveFocus($event, index)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
