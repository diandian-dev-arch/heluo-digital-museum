import type { Directive } from 'vue'
import { subscribeMotionFrame } from '../lib/motionFrame'
import { exponentialStep, POINTER_TIER_EVENT } from '../lib/pointerMotion'

export interface PointerSurfaceOptions {
  kind: 'collection' | 'exhibit' | 'product' | 'hero'
  maxTilt?: number
  spotlight?: boolean
  lift?: number
}

interface SurfaceState {
  element: HTMLElement
  options: Required<PointerSurfaceOptions>
  rect: DOMRect
  targetX: number
  targetY: number
  rotateX: number
  rotateY: number
  targetRotateX: number
  targetRotateY: number
  targetLight: number
  light: number
  leaving: boolean
  stopFrame?: () => void
  observer?: ResizeObserver
  listening: boolean
  onEnter: (event: PointerEvent) => void
  onMove: (event: PointerEvent) => void
  onLeave: () => void
  onTierChange: () => void
}

const states = new WeakMap<HTMLElement, SurfaceState>()
let activeState: SurfaceState | undefined

function deactivate(state: SurfaceState) {
  state.leaving = true
  state.targetRotateX = 0
  state.targetRotateY = 0
  state.targetLight = 0
  state.element.removeAttribute('data-pointer-active')
  schedule(state)
}

function activate(state: SurfaceState) {
  if (activeState && activeState !== state) clearSurface(activeState)
  activeState = state
  state.rect = state.element.getBoundingClientRect()
  state.leaving = false
  state.element.dataset.pointerActive = 'true'
}

function clearSurface(state: SurfaceState) {
  state.stopFrame?.()
  state.stopFrame = undefined
  state.rotateX = 0
  state.rotateY = 0
  state.targetRotateX = 0
  state.targetRotateY = 0
  state.light = 0
  state.targetLight = 0
  state.leaving = true
  state.element.removeAttribute('data-pointer-active')
  state.element.style.removeProperty('--pointer-x')
  state.element.style.removeProperty('--pointer-y')
  state.element.style.removeProperty('--pointer-light')
  state.element.style.transform = ''
  if (activeState === state) activeState = undefined
}

function attachSurface(state: SurfaceState) {
  if (state.listening) return
  state.rect = state.element.getBoundingClientRect()
  state.observer = new ResizeObserver(() => { state.rect = state.element.getBoundingClientRect() })
  state.observer.observe(state.element)
  state.element.addEventListener('pointerenter', state.onEnter, { passive: true })
  state.element.addEventListener('pointermove', state.onMove, { passive: true })
  state.element.addEventListener('pointerleave', state.onLeave, { passive: true })
  state.listening = true
}

function detachSurface(state: SurfaceState) {
  if (state.listening) {
    state.observer?.disconnect()
    state.observer = undefined
    state.element.removeEventListener('pointerenter', state.onEnter)
    state.element.removeEventListener('pointermove', state.onMove)
    state.element.removeEventListener('pointerleave', state.onLeave)
    state.listening = false
  }
  clearSurface(state)
}

function syncSurfaceCapability(state: SurfaceState) {
  if (document.documentElement.dataset.motionTier === 'full') attachSurface(state)
  else detachSurface(state)
}

function schedule(state: SurfaceState) {
  if (state.stopFrame) return
  state.stopFrame = subscribeMotionFrame((_time, deltaMs) => {
    state.rotateX = exponentialStep(state.rotateX, state.targetRotateX, deltaMs, 82)
    state.rotateY = exponentialStep(state.rotateY, state.targetRotateY, deltaMs, 82)
    state.light = exponentialStep(state.light, state.targetLight, deltaMs, 100)
    state.element.style.setProperty('--pointer-x', `${state.targetX}%`)
    state.element.style.setProperty('--pointer-y', `${state.targetY}%`)
    state.element.style.setProperty('--pointer-light', state.light.toFixed(3))
    state.element.style.transform = `perspective(var(--pointer-perspective)) rotateX(${state.rotateX.toFixed(3)}deg) rotateY(${state.rotateY.toFixed(3)}deg) translate3d(0, ${(-state.options.lift * state.light).toFixed(3)}px, 0)`

    if (
      state.leaving
      && Math.abs(state.rotateX) < .01
      && Math.abs(state.rotateY) < .01
      && state.light < .01
    ) {
      state.element.style.transform = ''
      state.element.removeAttribute('data-pointer-active')
      state.stopFrame?.()
      state.stopFrame = undefined
      if (activeState === state) activeState = undefined
    }
  })
}

function supportsSurface(event: PointerEvent): boolean {
  return (!event.pointerType || event.pointerType === 'mouse') && document.documentElement.dataset.motionTier === 'full'
}

export const pointerSurface: Directive<HTMLElement, PointerSurfaceOptions> = {
  mounted(element, binding) {
    const options: Required<PointerSurfaceOptions> = {
      kind: binding.value.kind,
      maxTilt: binding.value.maxTilt ?? (binding.value.kind === 'product' ? .8 : 1.15),
      spotlight: binding.value.spotlight ?? true,
      lift: binding.value.lift ?? 1,
    }
    element.dataset.pointerSurface = options.kind
    element.dataset.pointerSpotlight = String(options.spotlight)
    const state = {} as SurfaceState
    Object.assign(state, {
      element,
      options,
      rect: element.getBoundingClientRect(),
      targetX: 50,
      targetY: 50,
      rotateX: 0,
      rotateY: 0,
      targetRotateX: 0,
      targetRotateY: 0,
      targetLight: 0,
      light: 0,
      leaving: true,
      listening: false,
    })
    state.onEnter = (event) => {
      if (!supportsSurface(event)) return
      activate(state)
      state.onMove(event)
    }
    state.onMove = (event) => {
      if (!supportsSurface(event)) { deactivate(state); return }
      // A tier upgrade can attach listeners after pointerenter already fired.
      if (state.leaving || activeState !== state) activate(state)
      const width = Math.max(state.rect.width, 1)
      const height = Math.max(state.rect.height, 1)
      const normalizedX = Math.min(Math.max((event.clientX - state.rect.left) / width, 0), 1)
      const normalizedY = Math.min(Math.max((event.clientY - state.rect.top) / height, 0), 1)
      state.targetX = normalizedX * 100
      state.targetY = normalizedY * 100
      state.targetRotateX = (.5 - normalizedY) * 2 * options.maxTilt
      state.targetRotateY = (normalizedX - .5) * 2 * options.maxTilt
      state.targetLight = options.spotlight ? 1 : 0
      schedule(state)
    }
    state.onLeave = () => deactivate(state)
    state.onTierChange = () => syncSurfaceCapability(state)
    document.documentElement.addEventListener(POINTER_TIER_EVENT, state.onTierChange)
    syncSurfaceCapability(state)
    states.set(element, state)
  },
  unmounted(element) {
    const state = states.get(element)
    if (!state) return
    document.documentElement.removeEventListener(POINTER_TIER_EVENT, state.onTierChange)
    detachSurface(state)
    element.removeAttribute('data-pointer-surface')
    element.removeAttribute('data-pointer-spotlight')
    states.delete(element)
  },
}
