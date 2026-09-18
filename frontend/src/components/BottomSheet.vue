<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { AnimatePresence, motion, useDragControls } from 'motion-v'
import { Close } from '@element-plus/icons-vue'
import type { SheetSnapPoint } from '../lib/motion'
import { useLocale } from '../stores/locale'

const { locale } = useLocale()

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  snapPoint?: Exclude<SheetSnapPoint, 'closed'>
  panelClass?: string
}>(), { snapPoint: 'medium' })

const emit = defineEmits<{ (event: 'close'): void; (event: 'update:snapPoint', value: Exclude<SheetSnapPoint, 'closed'>): void }>()
const panel = ref<HTMLElement | { $el?: HTMLElement } | null>(null)
const lastFocused = ref<HTMLElement | null>(null)
const titleId = useId()
const dragControls = useDragControls()
let previousBodyOverflow = ''

function panelElement() {
  if (panel.value instanceof HTMLElement) return panel.value
  return panel.value?.$el ?? null
}
function focusPanel() { nextTick(() => panelElement()?.focus()) }
function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === 'Escape') { emit('close'); return }
  const currentPanel = panelElement()
  if (event.key !== 'Tab' || !currentPanel) return
  const focusable = [...currentPanel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) { event.preventDefault(); currentPanel.focus(); return }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const atPanel = active === currentPanel || !currentPanel.contains(active)
  if (event.shiftKey && (active === first || atPanel)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (active === last || atPanel)) { event.preventDefault(); first.focus() }
}
function finishDrag(_: PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) {
  if (info.velocity.y > 650 || info.offset.y > 150) emit('close')
  else if (info.velocity.y < -500 || info.offset.y < -110) emit('update:snapPoint', 'full')
  else emit('update:snapPoint', props.snapPoint)
}
function startDrag(event: PointerEvent) { dragControls.start(event) }
function toggleSnapPoint() { emit('update:snapPoint', props.snapPoint === 'full' ? 'medium' : 'full') }

watch(() => props.open, (open) => {
  if (open) {
    lastFocused.value = document.activeElement as HTMLElement | null
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    focusPanel()
  } else {
    document.body.style.overflow = previousBodyOverflow
    lastFocused.value?.focus?.()
    lastFocused.value = null
  }
}, { immediate: true })
onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <div v-if="open" class="bottom-sheet-root">
        <motion.button class="bottom-sheet-scrim" type="button" :aria-label="locale === 'en-US' ? 'Close panel' : '关闭面板'" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :exit="{ opacity: 0 }" @click="emit('close')" />
        <motion.section ref="panel" class="bottom-sheet" :class="panelClass" data-glass="light" data-glass-controls role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" :data-snap-point="snapPoint" drag="y" :drag-controls="dragControls" :drag-listener="false" drag-direction-lock :drag-constraints="{ top: 0, bottom: 280 }" :drag-elastic="0.14" :initial="{ y: '100%' }" :animate="{ y: 0 }" :exit="{ y: '100%' }" :transition="{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }" @drag-end="finishDrag">
          <button class="bottom-sheet-handle" type="button" :aria-label="locale === 'en-US' ? (snapPoint === 'full' ? 'Collapse panel' : 'Expand panel') : (snapPoint === 'full' ? '收起面板' : '展开面板')" @pointerdown="startDrag" @click="toggleSnapPoint"><i aria-hidden="true" /></button>
          <header class="bottom-sheet-header"><h2 :id="titleId">{{ title }}</h2><button class="bottom-sheet-close" type="button" :aria-label="locale === 'en-US' ? 'Close panel' : '关闭面板'" @click="emit('close')"><Close /></button></header>
          <div class="bottom-sheet-content"><slot /></div>
        </motion.section>
      </div>
    </AnimatePresence>
  </Teleport>
</template>
