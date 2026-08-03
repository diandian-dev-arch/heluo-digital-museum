import { describe, expect, it } from 'vitest'
import { POINT_COUNTS, downgradePointCloudQuality, selectPointCloudPalette, selectPointCloudQuality } from './pointCloudQuality'

describe('point cloud quality', () => {
  it('selects the requested desktop and mobile quality tiers', () => {
    expect(selectPointCloudQuality({ width: 1440, coarsePointer: false, cores: 8, memoryGiB: 16 })).toBe('high')
    expect(selectPointCloudQuality({ width: 1024, coarsePointer: false, cores: 4 })).toBe('medium')
    expect(selectPointCloudQuality({ width: 390, coarsePointer: true, cores: 8 })).toBe('mobile')
  })

  it('uses the planned point budgets and one-way fallback path', () => {
    expect(POINT_COUNTS.high).toBe(120_000)
    expect(POINT_COUNTS.medium).toBe(60_000)
    expect(POINT_COUNTS.mobile).toBe(24_000)
    expect(downgradePointCloudQuality('high')).toBe('medium')
    expect(downgradePointCloudQuality('medium')).toBe('fallback')
  })

  it('lifts mobile point-cloud contrast without changing the desktop palette', () => {
    const mobile = selectPointCloudPalette('mobile')
    const desktop = selectPointCloudPalette('high')
    const luminance = ([red, green, blue]: readonly number[]) => red * .2126 + green * .7152 + blue * .0722

    expect(luminance(mobile.jade)).toBeGreaterThanOrEqual(.38)
    expect(luminance(mobile.jade)).toBeGreaterThan(luminance(desktop.jade) * 6)
    expect(luminance(mobile.copper)).toBeGreaterThanOrEqual(.5)
    expect(mobile.copperBase).toBeGreaterThan(desktop.copperBase)
    expect(mobile.copperBase + mobile.copperRange).toBeLessThan(.4)
    expect(mobile.opacity).toBeGreaterThan(desktop.opacity)
    expect(selectPointCloudPalette('medium')).toEqual(desktop)
  })
})
