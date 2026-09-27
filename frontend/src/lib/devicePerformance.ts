export type DevicePerformanceTier = 'full' | 'constrained'

export interface DevicePerformanceContext {
  width: number
  coarsePointer: boolean
  saveData?: boolean
  effectiveType?: string
  cores?: number
  memoryGiB?: number
}

export function selectDevicePerformanceTier(context: DevicePerformanceContext): DevicePerformanceTier {
  const slowConnection = /^(slow-)?2g$|^3g$/i.test(context.effectiveType ?? '')
  const lowCpu = typeof context.cores === 'number' && context.cores > 0 && context.cores <= 4
  const lowMemory = typeof context.memoryGiB === 'number' && context.memoryGiB > 0 && context.memoryGiB <= 4
  return context.width <= 760 || context.coarsePointer || context.saveData || slowConnection || lowCpu || lowMemory
    ? 'constrained'
    : 'full'
}

export function applyDevicePerformanceTier(): DevicePerformanceTier {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  const tier = selectDevicePerformanceTier({
    width: window.innerWidth,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType,
    cores: navigator.hardwareConcurrency,
    memoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  })
  document.documentElement.dataset.performanceTier = tier
  return tier
}
