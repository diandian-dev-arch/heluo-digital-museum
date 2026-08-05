import { gsap } from 'gsap'

export type GsapScope = HTMLElement | null

/** Creates a scoped GSAP context so route/component teardown can revert all work. */
export function createGsapContext(root: GsapScope, setup: () => void): gsap.Context | undefined {
  if (!root) return undefined
  return gsap.context(setup, root)
}

/** Public animation tier gate shared by GSAP page effects. */
export function shouldRunGsapReveal(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (document.documentElement.dataset.motionTier === 'static') return false
  if (typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isConstrainedGsapReveal(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return document.documentElement.dataset.motionTier === 'restrained'
    || window.matchMedia('(max-width: 767px)').matches
    || window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(hover: none)').matches
}
