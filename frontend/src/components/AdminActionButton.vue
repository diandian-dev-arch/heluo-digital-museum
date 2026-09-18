<script setup lang="ts">
import { computed } from 'vue'
import { Check, Close, Delete, Edit, Message, Plus, RefreshLeft } from '@element-plus/icons-vue'

type AdminAction = 'edit' | 'publish' | 'withdraw' | 'delete' | 'restore' | 'disable' | 'email' | 'confirm' | 'cancel' | 'complete' | 'shelf' | 'unshelf' | 'stock'

const props = defineProps<{ action: AdminAction; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'click', payload: MouseEvent): void }>()
const icons = { edit: Edit, publish: Check, withdraw: RefreshLeft, delete: Delete, restore: RefreshLeft, disable: Close, email: Message, confirm: Check, cancel: Close, complete: Check, shelf: Check, unshelf: RefreshLeft, stock: Plus }
const tone = computed(() => {
  if (['publish', 'restore', 'confirm', 'complete', 'shelf'].includes(props.action)) return 'primary'
  if (['delete', 'disable', 'cancel'].includes(props.action)) return 'danger'
  return 'secondary'
})
</script>

<template>
  <button type="button" class="admin-action-button" :class="`admin-action-button--${tone}`" :data-glass="tone === 'secondary' ? 'compact' : undefined" :data-glass-interactive="tone === 'secondary' ? '' : undefined" :data-tactile-variant="tone" data-galaxy-button data-tactile-button :disabled="disabled" @click="emit('click', $event)">
    <component :is="icons[action]" aria-hidden="true" />
    <span><slot /></span>
  </button>
</template>
