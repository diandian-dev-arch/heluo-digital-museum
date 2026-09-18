<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePointerCapabilities } from '../composables/usePointerCapabilities'
import { usePointerMotion, type PointerPositionSubscriber } from '../composables/usePointerMotion'
import { subscribeMotionFrame } from '../lib/motionFrame'
import {
  DOT_FIELD_CONFIG,
  createDotFieldPoints,
  resetDotFieldTargets,
  resolveDotFieldRadius,
  setDotFieldPointerTarget,
  settleDotFieldPoints,
  type DotFieldPoint,
} from '../lib/pointerDotField'
import { POINTER_TIER_EVENT, type MotionTier } from '../lib/pointerMotion'

type DotFieldState = 'idle' | 'active' | 'settling' | 'static' | 'disabled'
type DotFieldVariant = 'image' | 'paper' | 'heading'

const props = withDefaults(defineProps<{ variant?: DotFieldVariant }>(), { variant: 'paper' })
const canvas = ref<HTMLCanvasElement | null>(null)
const state = ref<DotFieldState>('disabled')
const intersecting = ref(true)
const darkTheme = ref(false)
const applicationTier = ref<MotionTier>('full')
const { tier, reducedTransparency, downgradeForFps } = usePointerCapabilities()
const { pointer, subscribePosition } = usePointerMotion()
let host: HTMLElement | null = null
let context: CanvasRenderingContext2D | null = null
let points: DotFieldPoint[] = []
let width = 0
let height = 0
let radius = 170
let pointerInside = false
let pointerLocalX = 0
let pointerLocalY = 0
let stopFrame: (() => void) | undefined
let stopPosition: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined
let sampledFrames = 0
let sampledTime = 0
let mounted = false

// A temporary application downgrade must not remove the already-static
// transparency fallback. Capability-level static modes still take priority.
const hasStaticOpaqueField = () => mounted
  && intersecting.value
  && reducedTransparency.value
  && tier.value !== 'static'
const supportsCanvasMode = () => mounted
  && !reducedTransparency.value
  && tier.value === 'full'
  && applicationTier.value === 'full'
const canRenderCanvas = () => mounted
  && intersecting.value
  && supportsCanvasMode()

function drawPoints() {
  if (!context || !canRenderCanvas()) return
  context.clearRect(0, 0, width, height)
  const dark = darkTheme.value
  const heading = props.variant === 'heading'
  const palette = dark
    ? [
        'rgba(75, 153, 133, .34)', 'rgba(245, 190, 39, .68)',
        'rgba(91, 207, 170, .88)', 'rgba(255, 202, 37, .98)',
        'rgba(72, 196, 158, .34)', 'rgba(255, 180, 28, .48)',
      ]
    : props.variant === 'image'
      ? [
          'rgba(8, 117, 87, .4)', 'rgba(239, 188, 37, .58)',
          'rgba(14, 160, 116, .98)', 'rgba(255, 220, 56, 1)',
          'rgba(32, 201, 149, .56)', 'rgba(255, 226, 78, .6)',
        ]
      : [
          'rgba(7, 124, 92, .34)', 'rgba(230, 176, 17, .52)',
          'rgba(6, 153, 111, .96)', 'rgba(255, 204, 20, .99)',
          'rgba(24, 188, 137, .48)', 'rgba(255, 215, 48, .54)',
        ]

  // Bright architecture needs local contrast, not a page-wide veil. The field
  // is fully feathered and exists only while the pointer is inside the surface.
  if (pointerInside && !dark && !heading) {
    const contrastRadius = Math.min(radius * .7, 120)
    const contrast = context.createRadialGradient(
      pointerLocalX, pointerLocalY, 0,
      pointerLocalX, pointerLocalY, contrastRadius,
    )
    contrast.addColorStop(0, 'rgba(7, 54, 45, .075)')
    contrast.addColorStop(.46, 'rgba(7, 54, 45, .036)')
    contrast.addColorStop(1, 'rgba(7, 54, 45, 0)')
    context.beginPath()
    context.arc(pointerLocalX, pointerLocalY, contrastRadius, 0, Math.PI * 2)
    context.fillStyle = contrast
    context.fill()
  }

  // Quiet jade and digital-gold sampling grid: the page remains the subject until the pointer arrives.
  context.globalAlpha = heading ? .36 : 1
  ;([false, true] as const).forEach((bronze) => {
    context!.beginPath()
    points.forEach((point) => {
      if (point.bronze !== bronze) return
      const baseRadius = bronze ? DOT_FIELD_CONFIG.bronzeRadius : DOT_FIELD_CONFIG.jadeRadius
      context!.moveTo(point.x + baseRadius, point.y)
      context!.arc(point.x, point.y, baseRadius, 0, Math.PI * 2)
    })
    context!.fillStyle = palette[bronze ? 1 : 0]!
    context!.fill()
  })

  // Nearby samples only brighten and breathe radially; they never connect into a mesh.
  context.globalAlpha = heading ? .8 : 1
  ;([false, true] as const).forEach((bronze) => {
    context!.beginPath()
    points.forEach((point) => {
      if (point.bronze !== bronze || point.activity < .035) return
      const baseRadius = bronze ? DOT_FIELD_CONFIG.bronzeRadius : DOT_FIELD_CONFIG.jadeRadius
      const activeRadius = baseRadius * point.scale * (.68 + point.activity * .32)
      context!.moveTo(point.x + activeRadius, point.y)
      context!.arc(point.x, point.y, activeRadius, 0, Math.PI * 2)
    })
    context!.shadowColor = palette[bronze ? 5 : 4]!
    context!.shadowBlur = bronze ? 3 : 7
    context!.fillStyle = palette[bronze ? 3 : 2]!
    context!.fill()
    context!.shadowBlur = 0
    context!.shadowColor = 'transparent'
  })

  context.globalAlpha = 1
}

function resizeField() {
  if (!canRenderCanvas()) {
    releaseCanvasField(hasStaticOpaqueField() ? 'static' : 'disabled')
    return
  }
  if (!canvas.value || !host) return
  const bounds = host.getBoundingClientRect()
  width = Math.max(bounds.width, 0)
  height = Math.max(bounds.height, 0)
  if (!width || !height) {
    releaseCanvasField('disabled')
    return
  }
  const dpr = Math.min(window.devicePixelRatio || 1, DOT_FIELD_CONFIG.maxDpr)
  canvas.value.width = Math.round(width * dpr)
  canvas.value.height = Math.round(height * dpr)
  context = canvas.value.getContext('2d')
  if (!context) {
    releaseCanvasField('disabled')
    return
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  points = createDotFieldPoints(width, height)
  radius = resolveDotFieldRadius(width, height)
  pointerInside = false
  state.value = 'idle'
  drawPoints()
}

function stopMotion() {
  stopFrame?.()
  stopFrame = undefined
}

function releaseCanvasField(nextState: Extract<DotFieldState, 'static' | 'disabled'>) {
  stopMotion()
  pointerInside = false
  sampledFrames = 0
  sampledTime = 0
  points = []
  context = null
  width = 0
  height = 0
  if (canvas.value && (canvas.value.width !== 0 || canvas.value.height !== 0)) {
    canvas.value.width = 0
    canvas.value.height = 0
  }
  state.value = nextState
}

function startFieldRuntime() {
  if (!host) return
  if (!stopPosition) stopPosition = subscribePosition(handlePointerPosition)
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(resizeField)
    resizeObserver.observe(host)
  }
  if (!intersectionObserver) {
    intersectionObserver = new IntersectionObserver(([entry]) => {
      intersecting.value = entry?.isIntersecting ?? false
    })
    intersectionObserver.observe(host)
  }
}

function stopFieldRuntime() {
  stopPosition?.()
  stopPosition = undefined
  resizeObserver?.disconnect()
  resizeObserver = undefined
  intersectionObserver?.disconnect()
  intersectionObserver = undefined
}

function refreshFieldMode() {
  if (supportsCanvasMode()) {
    startFieldRuntime()
    if (canRenderCanvas()) resizeField()
    else releaseCanvasField('disabled')
    return
  }
  stopFieldRuntime()
  intersecting.value = true
  releaseCanvasField(hasStaticOpaqueField() ? 'static' : 'disabled')
}

function ensureFrame() {
  if (!mounted || stopFrame || !canRenderCanvas() || !points.length || !context) return
  stopFrame = subscribeMotionFrame((_time, deltaMs) => {
    const settled = settleDotFieldPoints(points, deltaMs, pointerInside)
    drawPoints()

    sampledFrames += 1
    sampledTime += deltaMs
    if (sampledFrames >= 30) {
      downgradeForFps(sampledFrames / (sampledTime / 1000))
      sampledFrames = 0
      sampledTime = 0
    }

    if (settled) {
      stopMotion()
      state.value = pointerInside ? 'active' : 'idle'
    }
  })
}

function leaveField() {
  if (!pointerInside) return
  pointerInside = false
  resetDotFieldTargets(points)
  state.value = 'settling'
  ensureFrame()
}

const handlePointerPosition: PointerPositionSubscriber = (position) => {
  if (!canRenderCanvas() || !host || !points.length) return
  const bounds = host.getBoundingClientRect()
  const localX = position.clientX - bounds.left
  const localY = position.clientY - bounds.top
  const inside = localX >= 0 && localX <= bounds.width && localY >= 0 && localY <= bounds.height
  if (!inside) {
    leaveField()
    return
  }

  pointerInside = true
  pointerLocalX = localX
  pointerLocalY = localY
  setDotFieldPointerTarget(points, localX, localY, Math.hypot(position.velocityX, position.velocityY), radius)
  state.value = 'active'
  ensureFrame()
}

function onTierChange(event: Event) {
  const nextTier = (event as CustomEvent<{ tier?: MotionTier }>).detail?.tier
  if (nextTier === 'full' || nextTier === 'restrained' || nextTier === 'static') applicationTier.value = nextTier
}

function onThemeChange(event: Event) {
  darkTheme.value = (event as CustomEvent<'light' | 'dark'>).detail === 'dark'
}

watch([intersecting, tier, applicationTier, reducedTransparency], refreshFieldMode)
watch(darkTheme, () => { if (canRenderCanvas()) drawPoints() })
watch(() => pointer.visible, (visible) => { if (!visible) leaveField() })

onMounted(() => {
  mounted = true
  darkTheme.value = document.documentElement.dataset.theme === 'dark'
  host = canvas.value?.parentElement ?? null
  const rootTier = document.documentElement.dataset.motionTier
  if (rootTier === 'full' || rootTier === 'restrained' || rootTier === 'static') applicationTier.value = rootTier
  document.documentElement.addEventListener(POINTER_TIER_EVENT, onTierChange)
  window.addEventListener('heluo:theme-change', onThemeChange)
  refreshFieldMode()
})

onBeforeUnmount(() => {
  mounted = false
  stopMotion()
  stopFieldRuntime()
  document.documentElement.removeEventListener(POINTER_TIER_EVENT, onTierChange)
  window.removeEventListener('heluo:theme-change', onThemeChange)
  releaseCanvasField('disabled')
})
</script>

<template>
  <canvas
    ref="canvas"
    width="0"
    height="0"
    class="pointer-dot-field"
    :data-state="state"
    :data-renderer="state === 'static' ? 'css' : state === 'disabled' ? 'none' : 'canvas'"
    :data-variant="variant"
    :data-palette="reducedTransparency ? 'opaque' : variant"
    :data-wave="pointerInside ? 'tracking' : 'idle'"
    data-effect="luminous-point-wave"
    data-pointer-dot-field
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.pointer-dot-field[data-renderer="css"][data-palette="opaque"] {
  background-image:
    radial-gradient(circle, rgb(86 151 133) 0 .72px, transparent .9px),
    radial-gradient(circle, rgb(238 187 47) 0 1.18px, transparent 1.36px);
  background-position: center, calc(50% + 27px) calc(50% + 27px);
  background-size: 27px 27px, 81px 81px;
  opacity: 1;
}
</style>
