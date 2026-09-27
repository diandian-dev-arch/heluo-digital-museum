<script setup lang="ts">
withDefaults(defineProps<{
  id: string
  modelValue: boolean
  label?: string
  disabled?: boolean
}>(), { label: '', disabled: false })

const emit = defineEmits<{
  'update:modelValue': [checked: boolean]
}>()
</script>

<template>
  <label class="glass-checkbox" :class="{ 'glass-checkbox--disabled': disabled }" :for="id" data-galaxy-checkbox data-tactile-checkbox>
    <input :id="id" type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span class="glass-checkbox__box" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m5 12.5 4.2 4.2L19 7" /></svg></span>
    <span v-if="label" class="glass-checkbox__label">{{ label }}</span>
  </label>
</template>
