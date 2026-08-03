import { describe, expect, it } from 'vitest'
import { interpolateExhibitOrbitOffset, selectExhibitCameraDistanceScale, selectExhibitCanvasTouchAction } from './exhibitInteraction'

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
})
