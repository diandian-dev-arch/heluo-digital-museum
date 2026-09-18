export interface ExhibitPointerContext {
  width: number
  coarsePointer: boolean
}

export interface ExhibitCameraContext {
  width: number
}

export interface ExhibitActivationContext {
  coarsePointer: boolean
  saveData?: boolean
  effectiveType?: string
  memoryGiB?: number
}

export interface ExhibitModelSources {
  modelUrl: string
  modelSizeBytes?: number | null
  mobileModelUrl?: string | null
  mobileModelSizeBytes?: number | null
}

export interface ExhibitModelSource {
  url: string
  sizeBytes?: number
  mobile: boolean
}

export interface ExhibitRenderContext {
  mobile: boolean
}

export interface ExhibitRenderProfile {
  antialias: boolean
  shadows: boolean
  dust: boolean
  floorSegments: number
  baseSegments: number
  trimSegments: number
  ringSegments: number
}

export interface ExhibitOrbitOffset {
  x: number
  y: number
  z: number
}

export function requiresManualExhibitActivation(context: ExhibitActivationContext): boolean {
  const slowConnection = /^(slow-)?2g$|^3g$/i.test(context.effectiveType?.trim() ?? '')
  const lowMemory = typeof context.memoryGiB === 'number' && context.memoryGiB > 0 && context.memoryGiB <= 4
  return context.coarsePointer || context.saveData === true || slowConnection || lowMemory
}

export function selectExhibitModelSource(sources: ExhibitModelSources, preferMobile: boolean): ExhibitModelSource {
  const mobileUrl = sources.mobileModelUrl?.trim()
  if (preferMobile && mobileUrl) {
    return {
      url: mobileUrl,
      sizeBytes: sources.mobileModelSizeBytes ?? undefined,
      mobile: true,
    }
  }
  return {
    url: sources.modelUrl,
    sizeBytes: sources.modelSizeBytes ?? undefined,
    mobile: false,
  }
}

export function selectExhibitRenderProfile(context: ExhibitRenderContext): ExhibitRenderProfile {
  return context.mobile
    ? { antialias: false, shadows: false, dust: false, floorSegments: 48, baseSegments: 48, trimSegments: 64, ringSegments: 48 }
    : { antialias: true, shadows: true, dust: true, floorSegments: 96, baseSegments: 96, trimSegments: 128, ringSegments: 96 }
}

export function createRetryableAsyncLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    if (!pending) {
      pending = load().catch((error: unknown) => {
        pending = undefined
        throw error
      })
    }
    return pending
  }
}

export function selectExhibitCanvasTouchAction(context: ExhibitPointerContext): 'none' | 'pan-y' {
  return context.coarsePointer || context.width <= 760 ? 'pan-y' : 'none'
}

export function selectExhibitCameraDistanceScale(context: ExhibitCameraContext): number {
  // A phone's portrait canvas makes the desktop framing feel cramped. Keep the
  // viewing angle while giving the object more breathing room.
  return context.width <= 760 ? 1.28 : 1
}

export function interpolateExhibitOrbitOffset(
  from: ExhibitOrbitOffset,
  to: ExhibitOrbitOffset,
  progress: number,
): ExhibitOrbitOffset {
  const t = Math.min(Math.max(progress, 0), 1)
  const fromRadius = Math.hypot(from.x, from.y, from.z)
  const toRadius = Math.hypot(to.x, to.y, to.z)
  if (fromRadius === 0 || toRadius === 0) {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    }
  }

  const fromPolar = Math.acos(Math.min(Math.max(from.y / fromRadius, -1), 1))
  const toPolar = Math.acos(Math.min(Math.max(to.y / toRadius, -1), 1))
  const fromAzimuth = Math.atan2(from.x, from.z)
  const toAzimuth = Math.atan2(to.x, to.z)
  let azimuthDelta = toAzimuth - fromAzimuth
  if (azimuthDelta > Math.PI) azimuthDelta -= Math.PI * 2
  if (azimuthDelta < -Math.PI) azimuthDelta += Math.PI * 2

  const radius = fromRadius + (toRadius - fromRadius) * t
  const polar = fromPolar + (toPolar - fromPolar) * t
  const azimuth = fromAzimuth + azimuthDelta * t
  const horizontalRadius = radius * Math.sin(polar)
  return {
    x: horizontalRadius * Math.sin(azimuth),
    y: radius * Math.cos(polar),
    z: horizontalRadius * Math.cos(azimuth),
  }
}
