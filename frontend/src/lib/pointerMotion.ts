export type CursorIntent = 'idle' | 'link' | 'action' | 'danger' | 'media' | 'native'
export type MotionTier = 'full' | 'restrained' | 'static'
export const POINTER_TIER_EVENT = 'heluo:pointer-tier-change'

export interface PointerMotionCapabilities {
  finePointer: boolean
  hover: boolean
  reducedMotion: boolean
  moreContrast: boolean
  forcedColors?: boolean
  hidden?: boolean
  saveData?: boolean
  cores?: number
  memoryGiB?: number
  magnified?: boolean
}

export interface FpsDowngradeResult {
  tier: MotionTier
  criticalWindows: number
}

export interface ExhibitPointerPolicyInput {
  pointerInside: boolean
  controlsActive: boolean
  autoRotate: boolean
  cameraTransitionActive: boolean
  time: number
  resumeAt: number
  pointCloudIdle: boolean
}

export interface ExhibitPointerPolicy {
  pointerAllowed: boolean
  amplitude: number
  pointResponseAllowed: boolean
}

const MOTION_TIER_WEIGHT: Record<MotionTier, number> = { full: 0, restrained: 1, static: 2 }

export function selectPointerMotionTier(capabilities: PointerMotionCapabilities): MotionTier {
  if (
    !capabilities.finePointer
    || !capabilities.hover
    || capabilities.reducedMotion
    || capabilities.moreContrast
    || capabilities.forcedColors
    || capabilities.hidden
    || capabilities.magnified
  ) return 'static'

  if (
    capabilities.saveData
    || (capabilities.cores !== undefined && capabilities.cores <= 4)
    || (capabilities.memoryGiB !== undefined && capabilities.memoryGiB <= 4)
  ) return 'restrained'

  return 'full'
}

export function selectEffectiveMotionTier(capabilityTier: MotionTier, applicationTier?: string): MotionTier {
  if (applicationTier !== 'full' && applicationTier !== 'restrained' && applicationTier !== 'static') return capabilityTier
  return MOTION_TIER_WEIGHT[applicationTier] > MOTION_TIER_WEIGHT[capabilityTier] ? applicationTier : capabilityTier
}

export function resolveExhibitPointerPolicy(
  tier: MotionTier,
  input: ExhibitPointerPolicyInput,
): ExhibitPointerPolicy {
  const pointerAllowed = tier !== 'static'
    && input.pointerInside
    && !input.controlsActive
    && !input.autoRotate
    && !input.cameraTransitionActive
    && input.time >= input.resumeAt

  return {
    pointerAllowed,
    amplitude: tier === 'full' ? 1 : tier === 'restrained' ? .5 : 0,
    pointResponseAllowed: tier === 'full' && pointerAllowed && input.pointCloudIdle,
  }
}

export function exponentialStep(current: number, target: number, deltaMs: number, tauMs: number): number {
  if (tauMs <= 0) return target
  const alpha = 1 - Math.exp(-Math.max(deltaMs, 0) / tauMs)
  return current + (target - current) * alpha
}

export function applyDeadZone(value: number, zone = .12): number {
  const magnitude = Math.abs(value)
  if (magnitude <= zone) return 0
  return Math.sign(value) * Math.min((magnitude - zone) / (1 - zone), 1)
}

export function selectFpsDowngrade(
  currentTier: MotionTier,
  fps: number,
  criticalWindows: number,
): FpsDowngradeResult {
  if (currentTier === 'static') return { tier: 'static', criticalWindows }
  if (fps < 40) {
    const nextCriticalWindows = criticalWindows + 1
    return {
      tier: nextCriticalWindows >= 2 ? 'static' : 'restrained',
      criticalWindows: nextCriticalWindows,
    }
  }
  if (fps < 50) return { tier: 'restrained', criticalWindows: 0 }
  return { tier: currentTier, criticalWindows: 0 }
}

export function resolveCursorIntent(target: EventTarget | null): CursorIntent {
  if (!(target instanceof Element)) return 'idle'
  const weight: Record<CursorIntent, number> = { idle: 0, link: 1, action: 2, danger: 3, media: 4, native: 5 }
  let intent: CursorIntent = 'idle'
  let element: Element | null = target

  while (element) {
    let candidate: CursorIntent | undefined
    if (element.matches('input, textarea, select, [contenteditable="true"], canvas')) candidate = 'native'
    else {
      const declared = (element as HTMLElement).dataset.cursor
      if (declared === 'idle' || declared === 'link' || declared === 'action' || declared === 'danger' || declared === 'media' || declared === 'native') candidate = declared
      else if (element.matches('.fluid-button--danger, .is-danger, [aria-label*="删除"], [aria-label*="移除"]')) candidate = 'danger'
      else if (element.matches('.fluid-button--primary, [type="submit"]')) candidate = 'action'
      else if (element.matches('a, button, [role="button"]')) candidate = 'link'
    }
    if (candidate && weight[candidate] > weight[intent]) intent = candidate
    if (intent === 'native') return intent
    element = element.parentElement
  }

  return intent
}

export function readPointerMotionCapabilities(): PointerMotionCapabilities {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  const finePointer = window.matchMedia('(pointer: fine)').matches
  const hover = window.matchMedia('(hover: hover)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const moreContrast = window.matchMedia('(prefers-contrast: more)').matches
  const forcedColors = window.matchMedia('(forced-colors: active)').matches
  const deviceMagnified = window.devicePixelRatio >= 2 || (window.visualViewport?.scale ?? 1) >= 1.8
  const tierAlreadyStatic = !finePointer || !hover || reducedMotion || moreContrast || forcedColors || document.hidden
  // Reading computed style forces layout. Coarse/reduced modes are already
  // static, so a root-font magnification check cannot change their policy.
  const rootFontSize = tierAlreadyStatic || deviceMagnified
    ? 16
    : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
  return {
    finePointer,
    hover,
    reducedMotion,
    moreContrast,
    forcedColors,
    hidden: document.hidden,
    saveData: nav.connection?.saveData,
    cores: nav.hardwareConcurrency,
    memoryGiB: nav.deviceMemory,
    magnified: deviceMagnified || rootFontSize >= 24,
  }
}
