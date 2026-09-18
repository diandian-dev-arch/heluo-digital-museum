import { describe, expect, it, vi } from 'vitest'
import {
  createRetryableAsyncLoader,
  interpolateExhibitOrbitOffset,
  requiresManualExhibitActivation,
  selectExhibitCameraDistanceScale,
  selectExhibitCanvasTouchAction,
  selectExhibitModelSource,
  selectExhibitRenderProfile,
} from './exhibitInteraction'

describe('exhibit canvas interaction', () => {
  it('keeps vertical page scrolling available on mobile and coarse pointers', () => {
    expect(selectExhibitCanvasTouchAction({ width: 390, coarsePointer: false })).toBe('pan-y')
    expect(selectExhibitCanvasTouchAction({ width: 1024, coarsePointer: true })).toBe('pan-y')
  })

  it('preserves full OrbitControls gestures for desktop pointers', () => {
    expect(selectExhibitCanvasTouchAction({ width: 1440, coarsePointer: false })).toBe('none')
  })

  it('backs the default camera away only on phone-sized viewports', () => {
    expect(selectExhibitCameraDistanceScale({ width: 390 })).toBe(1.28)
    expect(selectExhibitCameraDistanceScale({ width: 760 })).toBe(1.28)
    expect(selectExhibitCameraDistanceScale({ width: 768 })).toBe(1)
    expect(selectExhibitCameraDistanceScale({ width: 1440 })).toBe(1)
  })

  it('orbits around the exhibit instead of crossing it on a front-to-back transition', () => {
    const from = { x: 0, y: -.55, z: 8.15 }
    const to = { x: 0, y: -.55, z: -8.15 }
    const midpoint = interpolateExhibitOrbitOffset(from, to, .5)
    const finish = interpolateExhibitOrbitOffset(from, to, 1)

    expect(Math.hypot(midpoint.x, midpoint.y, midpoint.z)).toBeCloseTo(Math.hypot(from.x, from.y, from.z), 5)
    expect(Math.abs(midpoint.x)).toBeGreaterThan(8)
    expect(midpoint.z).toBeCloseTo(0, 5)
    expect(finish.x).toBeCloseTo(to.x, 5)
    expect(finish.y).toBeCloseTo(to.y, 5)
    expect(finish.z).toBeCloseTo(to.z, 5)
  })

  it.each([
    { coarsePointer: true },
    { coarsePointer: false, saveData: true },
    { coarsePointer: false, effectiveType: 'slow-2g' },
    { coarsePointer: false, effectiveType: '2g' },
    { coarsePointer: false, effectiveType: '3g' },
    { coarsePointer: false, memoryGiB: 4 },
  ])('requires a user gesture for a constrained device: %o', (context) => {
    expect(requiresManualExhibitActivation(context)).toBe(true)
  })

  it('keeps automatic startup for an unconstrained desktop', () => {
    expect(requiresManualExhibitActivation({
      coarsePointer: false,
      effectiveType: '4g',
      memoryGiB: 8,
    })).toBe(false)
  })

  it('prefers the optional mobile model only for a constrained device', () => {
    const sources = {
      modelUrl: '/ding-desktop.glb',
      modelSizeBytes: 5_213_372,
      mobileModelUrl: '/ding-mobile.glb',
      mobileModelSizeBytes: 837_720,
    }
    expect(selectExhibitModelSource(sources, true)).toEqual({
      url: '/ding-mobile.glb',
      sizeBytes: 837_720,
      mobile: true,
    })
    expect(selectExhibitModelSource(sources, false)).toEqual({
      url: '/ding-desktop.glb',
      sizeBytes: 5_213_372,
      mobile: false,
    })
    expect(selectExhibitModelSource({ ...sources, mobileModelUrl: null }, true).url).toBe('/ding-desktop.glb')
  })

  it('turns off fixed GPU costs and lowers geometry segments for the mobile renderer', () => {
    const mobile = selectExhibitRenderProfile({ mobile: true })
    const desktop = selectExhibitRenderProfile({ mobile: false })
    expect(mobile).toMatchObject({ antialias: false, shadows: false, dust: false })
    expect(mobile.baseSegments).toBeLessThan(desktop.baseSegments)
    expect(mobile.trimSegments).toBeLessThan(desktop.trimSegments)
  })

  it('deduplicates an in-flight module load and allows retry after a rejection', async () => {
    let resolveFirst: ((value: string) => void) | undefined
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveFirst = resolve }))
      .mockRejectedValueOnce(new Error('temporary chunk failure'))
      .mockResolvedValueOnce('recovered')
    const retryableLoad = createRetryableAsyncLoader(load)

    const first = retryableLoad()
    const duplicate = retryableLoad()
    expect(first).toBe(duplicate)
    expect(load).toHaveBeenCalledOnce()
    resolveFirst?.('loaded')
    await expect(first).resolves.toBe('loaded')
    await expect(retryableLoad()).resolves.toBe('loaded')

    const rejectingLoad = createRetryableAsyncLoader(load)
    await expect(rejectingLoad()).rejects.toThrow('temporary chunk failure')
    await expect(rejectingLoad()).resolves.toBe('recovered')
    expect(load).toHaveBeenCalledTimes(3)
  })
})
