<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  message: string
  error?: string
  confirmLabel?: string
  cancelLabel?: string
  secondaryLabel?: string
  pending?: boolean
}>(), { confirmLabel: '确认', cancelLabel: '取消', secondaryLabel: '', pending: false })
const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void; (event: 'secondary'): void }>()
const dialog = ref<HTMLElement | null>(null)
let restoreFocus: HTMLElement | null = null

function focusDialog() {
  const target = dialog.value?.querySelector<HTMLElement>('[data-confirm-cancel], [data-confirm-primary]')
  target?.focus()
}
function rememberFocus() {
  if (!restoreFocus) restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
}
function restoreFocusNow() {
  restoreFocus?.focus()
  restoreFocus = null
}
function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === 'Escape' && !props.pending) { event.preventDefault(); emit('cancel'); return }
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not([disabled])'))
  if (!focusable.length) { event.preventDefault(); dialog.value.focus(); return }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const atPanel = document.activeElement === dialog.value || !dialog.value.contains(document.activeElement)
  if (event.shiftKey && (document.activeElement === first || atPanel)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (document.activeElement === last || atPanel)) { event.preventDefault(); first.focus() }
}
watch(() => props.pending, async (pending) => {
  if (!props.open) return
  await nextTick()
  if (pending) dialog.value?.focus()
  else if (document.activeElement === dialog.value) focusDialog()
})
watch(() => props.open, async (open) => {
  if (open) {
    rememberFocus()
    await nextTick()
    focusDialog()
  } else restoreFocusNow()
})
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (props.open) {
    rememberFocus()
    void nextTick(focusDialog)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  restoreFocusNow()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="admin-confirm-backdrop" role="presentation" @click.self="!pending && emit('cancel')">
      <section ref="dialog" class="admin-confirm-dialog" data-glass="dark" role="dialog" aria-modal="true" :aria-busy="pending" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-message" tabindex="-1">
        <p class="eyebrow">CONFIRM ACTION</p>
        <h2 id="admin-confirm-title">{{ title }}</h2>
        <p id="admin-confirm-message">{{ message }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="admin-confirm-dialog__actions">
          <button type="button" data-confirm-cancel data-glass="compact" :disabled="pending" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button v-if="secondaryLabel" type="button" data-confirm-secondary data-glass="compact" :disabled="pending" @click="emit('secondary')">{{ secondaryLabel }}</button>
          <button type="button" data-confirm-primary data-glass="compact" :disabled="pending" @click="emit('confirm')">{{ pending ? '处理中…' : confirmLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
