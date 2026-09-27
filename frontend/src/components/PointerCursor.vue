<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePointerCapabilities } from '../composables/usePointerCapabilities'
import { usePointerMotion } from '../composables/usePointerMotion'
import { subscribeMotionFrame } from '../lib/motionFrame'
import { POINTER_TIER_EVENT, resolveCursorIntent, type MotionTier } from '../lib/pointerMotion'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const dot = ref<HTMLSpanElement | null>(null)
const halo = ref<HTMLSpanElement | null>(null)
const keyboardMode = ref(false)
const directInputTier = ref<MotionTier | null>(null)
const { tier, reducedTransparency, downgradeForFps } = usePointerCapabilities()
const { pointer, position, updatePosition, setVisible, setPressed, setIntent, setTier } = usePointerMotion()
const enabled = computed(() => !props.disabled && !keyboardMode.value && directInputTier.value === null && tier.value !== 'static')

let stopFrame: (() => void) | undefined
let previousX = 0
let previousY = 0
let previousMoveTime = 0
let sampledTime = 0
let sampledFrames = 0
let performanceProbeActive = false
let frameCheckQueued = false
let lastIntentTarget: EventTarget | null = null
let mounted = false
let haloX = 0
let haloY = 0
let haloReady = false

function updateCapabilityClass() {
  const root = document.documentElement
  const previousTier = root.dataset.motionTier
  const nextTier = props.disabled || keyboardMode.value ? 'static' : (directInputTier.value ?? tier.value)
  root.classList.toggle('pointer-motion-enabled', enabled.value)
  root.dataset.motionTier = nextTier
  root.dataset.reducedTransparency = reducedTransparency.value ? 'true' : 'false'
  setTier(nextTier)
  if (!enabled.value) hidePointer()
  if (previousTier !== nextTier) {
    root.dispatchEvent(new CustomEvent(POINTER_TIER_EVENT, { detail: { tier: nextTier } }))
  }
}

function hidePointer(resetPosition = true) {
  setVisible(false)
  stopFrame?.()
  stopFrame = undefined
  sampledFrames = 0
  sampledTime = 0
  performanceProbeActive = false
  haloReady = false
  halo.value?.setAttribute('data-pulling', 'false')
  if (resetPosition) {
    previousMoveTime = 0
    lastIntentTarget = null
  }
}

function ensureFrame() {
  if (!mounted || stopFrame || !enabled.value || !pointer.visible) return
  stopFrame = subscribeMotionFrame((_time, deltaMs) => {
    dot.value?.style.setProperty('transform', `translate3d(${position.clientX}px, ${position.clientY}px, 0)`)
    if (!haloReady) {
      haloX = position.clientX
      haloY = position.clientY
      haloReady = true
    }

    const followAlpha = 1 - Math.exp(-Math.min(deltaMs, 64) / 58)
    haloX += (position.clientX - haloX) * followAlpha
    haloY += (position.clientY - haloY) * followAlpha
    const lagX = position.clientX - haloX
    const lagY = position.clientY - haloY
    const lagDistance = Math.hypot(lagX, lagY)
    const pullAngle = Math.atan2(lagY, lagX)
    const pullScale = 1 + Math.min(lagDistance / 120, .06)
    halo.value?.style.setProperty(
      'transform',
      `translate3d(${haloX}px, ${haloY}px, 0) rotate(${pullAngle}rad) scaleX(${pullScale}) scaleY(${1 / pullScale})`,
    )
    halo.value?.setAttribute('data-pulling', String(lagDistance > .75))

    sampledTime += deltaMs
    sampledFrames += 1
    if (sampledFrames >= 20) {
      const fps = sampledFrames / (sampledTime / 1000)
      const nextTier = downgradeForFps(fps)
      performanceProbeActive = fps < 40 && nextTier === 'restrained'
      sampledFrames = 0
      sampledTime = 0
    }

    if (!performanceProbeActive && lagDistance <= .75) {
      stopFrame?.()
      stopFrame = undefined
    }
  })
}

function queueFrameCheck() {
  if (frameCheckQueued) return
  frameCheckQueued = true
  void nextTick(() => {
    frameCheckQueued = false
    if (mounted) ensureFrame()
  })
}

function useSystemPointerFor(event: PointerEvent): boolean {
  if (!event.pointerType || event.pointerType === 'mouse') return false
  keyboardMode.value = false
  directInputTier.value = event.pointerType === 'pen' ? 'restrained' : 'static'
  setPressed(false)
  hidePointer()
  // Restore the native cursor in the same input event; a deferred watcher leaves
  // hybrid devices with cursor:none until Vue's next render flush.
  updateCapabilityClass()
  return true
}

function onPointerMove(event: PointerEvent) {
  if (useSystemPointerFor(event)) return
  directInputTier.value = null
  keyboardMode.value = false
  const time = event.timeStamp || performance.now()
  const elapsed = previousMoveTime ? Math.max(time - previousMoveTime, 1) : 16.67
  const velocityX = (event.clientX - previousX) / elapsed * 1000
  const velocityY = (event.clientY - previousY) / elapsed * 1000
  previousX = event.clientX
  previousY = event.clientY
  previousMoveTime = time
  if (!haloReady) {
    haloX = event.clientX
    haloY = event.clientY
    haloReady = true
  }
  updatePosition(event.clientX, event.clientY, velocityX, velocityY)
  if (event.target !== lastIntentTarget) {
    lastIntentTarget = event.target
    setIntent(resolveCursorIntent(event.target))
  }
  if (enabled.value) setVisible(true)
  ensureFrame()
  // A keyboard-to-pointer switch remounts the cursor on the next Vue flush.
  // Re-request the shared frame there without writing DOM from pointermove.
  queueFrameCheck()
}

function onPointerDown(event: PointerEvent) {
  if (!useSystemPointerFor(event)) setPressed(true)
}
function onPointerUp() { setPressed(false) }
function onPointerLeave(event: PointerEvent) {
  if (!event.relatedTarget) {
    lastIntentTarget = null
    hidePointer()
  }
}
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Tab') keyboardMode.value = true
}
function onVisibilityChange() {
  if (document.hidden) hidePointer()
}
function onBlur() { hidePointer(); setPressed(false) }

watch([enabled, tier, reducedTransparency, directInputTier], updateCapabilityClass)

onMounted(() => {
  mounted = true
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointerup', onPointerUp, { passive: true })
  window.addEventListener('pointercancel', onPointerUp, { passive: true })
  window.addEventListener('pointerout', onPointerLeave, { passive: true })
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)
  updateCapabilityClass()
})

onBeforeUnmount(() => {
  mounted = false
  frameCheckQueued = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('pointerout', onPointerLeave)
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopFrame?.()
  document.documentElement.classList.remove('pointer-motion-enabled')
  delete document.documentElement.dataset.motionTier
  delete document.documentElement.dataset.reducedTransparency
})
</script>

<template>
  <div
    v-if="enabled"
    class="pointer-cursor"
    :class="{ 'is-visible': pointer.visible && enabled, 'is-pressed': pointer.pressed }"
    :data-intent="pointer.intent"
    aria-hidden="true"
  >
    <span ref="dot" class="pointer-cursor__dot"></span>
    <span ref="halo" class="pointer-cursor__halo" data-pulling="false"></span>
  </div>
</template>
