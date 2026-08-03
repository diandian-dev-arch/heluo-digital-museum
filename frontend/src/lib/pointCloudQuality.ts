export type PointCloudQuality = 'high' | 'medium' | 'mobile' | 'fallback'

export interface PointCloudPalette {
  jade: readonly [number, number, number]
  copper: readonly [number, number, number]
  copperBase: number
  copperRange: number
  opacity: number
}

export const POINT_COUNTS: Record<Exclude<PointCloudQuality, 'fallback'>, number> = {
  high: 120_000,
  medium: 60_000,
  mobile: 24_000,
}

export interface PointCloudCapabilities {
  width: number
  coarsePointer: boolean
  cores?: number
  memoryGiB?: number
}

export function selectPointCloudQuality(capabilities: PointCloudCapabilities): PointCloudQuality {
  if (capabilities.coarsePointer || capabilities.width < 768) return 'mobile'

  const hasStrongCpu = (capabilities.cores ?? 0) >= 8
  const hasEnoughMemory = capabilities.memoryGiB === undefined || capabilities.memoryGiB >= 8
  return capabilities.width >= 1280 && hasStrongCpu && hasEnoughMemory ? 'high' : 'medium'
}

export function downgradePointCloudQuality(quality: PointCloudQuality): PointCloudQuality {
  if (quality === 'high') return 'medium'
  if (quality === 'medium' || quality === 'mobile') return 'fallback'
  return 'fallback'
}

export function selectPointCloudPalette(quality: PointCloudQuality): PointCloudPalette {
  if (quality === 'mobile') {
    return {
      jade: [.12, .48, .3],
      copper: [.78, .5, .16],
      copperBase: .12,
      copperRange: .22,
      opacity: 1,
    }
  }

  return {
    jade: [.008, .07, .045],
    copper: [.32, .12, .02],
    copperBase: .08,
    copperRange: .1,
    opacity: .9,
  }
}

export function qualityLabel(quality: PointCloudQuality): string {
  return { high: '高画质', medium: '标准画质', mobile: '移动优化', fallback: '实体降级' }[quality]
}
