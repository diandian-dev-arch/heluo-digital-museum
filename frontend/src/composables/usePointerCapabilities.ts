import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { readPointerMotionCapabilities, selectFpsDowngrade, selectPointerMotionTier, type MotionTier } from '../lib/pointerMotion'

const TIER_WEIGHT: Record<MotionTier, number> = { full: 0, restrained: 1, static: 2 }

export function usePointerCapabilities() {
  const revision = ref(0)
  const performanceTier = ref<MotionTier>('full')
  let criticalFpsWindows = 0
  const queries: MediaQueryList[] = []
  const refresh = () => { revision.value += 1 }

  const tier = computed<MotionTier>(() => {
    revision.value
    const capabilityTier = selectPointerMotionTier(readPointerMotionCapabilities())
    return TIER_WEIGHT[performanceTier.value] > TIER_WEIGHT[capabilityTier] ? performanceTier.value : capabilityTier
  })

  const reducedTransparency = computed(() => {
    revision.value
    return window.matchMedia('(prefers-reduced-transparency: reduce)').matches
  })

  function downgradeForFps(fps: number) {
    const next = selectFpsDowngrade(performanceTier.value, fps, criticalFpsWindows)
    performanceTier.value = next.tier
    criticalFpsWindows = next.criticalWindows
  }

  onMounted(() => {
    ;[
      '(pointer: fine)',
      '(hover: hover)',
      '(prefers-reduced-motion: reduce)',
      '(prefers-reduced-transparency: reduce)',
      '(prefers-contrast: more)',
      '(forced-colors: active)',
    ].forEach((query) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', refresh)
      queries.push(media)
    })
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('resize', refresh)
    window.visualViewport?.addEventListener('resize', refresh)
    refresh()
  })

  onBeforeUnmount(() => {
    queries.forEach((media) => media.removeEventListener('change', refresh))
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('resize', refresh)
    window.visualViewport?.removeEventListener('resize', refresh)
  })

  return { tier, reducedTransparency, downgradeForFps }
}
