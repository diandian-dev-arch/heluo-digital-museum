import { describe, expect, it } from 'vitest'
import { applyDeadZone, exponentialStep, resolveCursorIntent, resolveExhibitPointerPolicy, selectEffectiveMotionTier, selectFpsDowngrade, selectPointerMotionTier } from './pointerMotion'

describe('pointer motion capabilities', () => {
  it('selects full, restrained and static tiers from real input constraints', () => {
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, cores: 8, memoryGiB: 16 })).toBe('full')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, cores: 4 })).toBe('restrained')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: true, moreContrast: false })).toBe('static')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: true })).toBe('static')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, forcedColors: true })).toBe('static')
    expect(selectPointerMotionTier({ finePointer: false, hover: false, reducedMotion: false, moreContrast: false })).toBe('static')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, hidden: true })).toBe('static')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, magnified: true })).toBe('static')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, saveData: true })).toBe('restrained')
    expect(selectPointerMotionTier({ finePointer: true, hover: true, reducedMotion: false, moreContrast: false, memoryGiB: 4 })).toBe('restrained')
  })

  it('uses frame-rate independent exponential smoothing', () => {
    const oneFrame = exponentialStep(0, 100, 16, 72)
    const twoFrames = exponentialStep(exponentialStep(0, 100, 8, 72), 100, 8, 72)
    expect(twoFrames).toBeCloseTo(oneFrame, 8)
    expect(oneFrame).toBeGreaterThan(0)
    expect(oneFrame).toBeLessThan(100)
  })

  it('requires two consecutive critical FPS windows before switching to static', () => {
    const firstCritical = selectFpsDowngrade('full', 36, 0)
    expect(firstCritical).toEqual({ tier: 'restrained', criticalWindows: 1 })
    expect(selectFpsDowngrade(firstCritical.tier, 35, firstCritical.criticalWindows)).toEqual({ tier: 'static', criticalWindows: 2 })
    expect(selectFpsDowngrade('full', 45, 1)).toEqual({ tier: 'restrained', criticalWindows: 0 })
  })

  it('keeps the stricter tier when the application downgrades at runtime', () => {
    expect(selectEffectiveMotionTier('full', 'restrained')).toBe('restrained')
    expect(selectEffectiveMotionTier('restrained', 'full')).toBe('restrained')
    expect(selectEffectiveMotionTier('full', 'static')).toBe('static')
    expect(selectEffectiveMotionTier('full', 'unknown')).toBe('full')
  })

  it('keeps camera input still inside the dead zone and normalizes outside it', () => {
    expect(applyDeadZone(.1)).toBe(0)
    expect(applyDeadZone(-.1)).toBe(0)
    expect(applyDeadZone(1)).toBe(1)
    expect(applyDeadZone(-1)).toBe(-1)
  })

  it('gives controls and static mode priority over exhibit pointer response', () => {
    const base = {
      pointerInside: true,
      controlsActive: false,
      autoRotate: false,
      cameraTransitionActive: false,
      time: 1000,
      resumeAt: 900,
      pointCloudIdle: true,
    }
    expect(resolveExhibitPointerPolicy('full', base)).toEqual({
      pointerAllowed: true,
      amplitude: 1,
      pointResponseAllowed: true,
    })
    expect(resolveExhibitPointerPolicy('restrained', base)).toEqual({
      pointerAllowed: true,
      amplitude: .5,
      pointResponseAllowed: false,
    })
    expect(resolveExhibitPointerPolicy('static', base)).toEqual({
      pointerAllowed: false,
      amplitude: 0,
      pointResponseAllowed: false,
    })
    expect(resolveExhibitPointerPolicy('full', { ...base, controlsActive: true }).pointerAllowed).toBe(false)
    expect(resolveExhibitPointerPolicy('full', { ...base, time: 899 }).pointerAllowed).toBe(false)
  })

  it('prioritizes declared and native cursor intent', () => {
    const danger = document.createElement('button')
    danger.dataset.cursor = 'danger'
    const icon = document.createElement('span')
    danger.append(icon)
    expect(resolveCursorIntent(icon)).toBe('danger')

    const input = document.createElement('input')
    expect(resolveCursorIntent(input)).toBe('native')

    const link = document.createElement('a')
    expect(resolveCursorIntent(link)).toBe('link')

    for (const tag of ['p', 'h1', 'h2', 'li', 'dt', 'dd', 'blockquote', 'pre', 'code']) {
      expect(resolveCursorIntent(document.createElement(tag))).toBe('idle')
    }

    const nativeCopy = document.createElement('p')
    nativeCopy.dataset.cursor = 'native'
    expect(resolveCursorIntent(nativeCopy)).toBe('native')

    const linkedHeading = document.createElement('h2')
    link.append(linkedHeading)
    expect(resolveCursorIntent(linkedHeading)).toBe('link')

    const outerDanger = document.createElement('div')
    outerDanger.dataset.cursor = 'danger'
    const innerAction = document.createElement('button')
    innerAction.dataset.cursor = 'action'
    const nestedIcon = document.createElement('span')
    innerAction.append(nestedIcon)
    outerDanger.append(innerAction)
    expect(resolveCursorIntent(nestedIcon)).toBe('danger')
  })
})
