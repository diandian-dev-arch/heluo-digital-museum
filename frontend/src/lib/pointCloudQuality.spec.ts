import { describe, expect, it } from 'vitest'
import { POINT_COUNTS, createPointCloudPerformanceMonitor, downgradePointCloudQuality, selectPointCloudPalette, selectPointCloudPointSize, selectPointCloudQuality } from './pointCloudQuality'

describe('point cloud quality', () => {
  it('selects the requested desktop and mobile quality tiers', () => {
    expect(selectPointCloudQuality({ width: 1440, coarsePointer: false, cores: 8, memoryGiB: 16 })).toBe('high')
    expect(selectPointCloudQuality({ width: 1024, coarsePointer: false, cores: 4 })).toBe('medium')
    expect(selectPointCloudQuality({ width: 390, coarsePointer: true, cores: 8 })).toBe('mobile')
  })

  it('uses the planned point budgets and one-way fallback path', () => {
    expect(POINT_COUNTS.high).toBe(120_000)
    expect(POINT_COUNTS.medium).toBe(60_000)
    expect(POINT_COUNTS.mobile).toBe(18_000)
    expect(downgradePointCloudQuality('high')).toBe('medium')
    expect(downgradePointCloudQuality('medium')).toBe('fallback')
  })

  it('ignores loading, transitions and short slow bursts', () => {
    const monitor = createPointCloudPerformanceMonitor()
    for (let time = 0; time < 10000; time += 100) expect(monitor.record(time, false, 'high')).toBeUndefined()
    for (let time = 10000; time < 13000; time += 100) expect(monitor.record(time, true, 'high')?.quality).toBeUndefined()
    monitor.reset()
    for (let time = 14000; time < 22000; time += 16) expect(monitor.record(time, true, 'high')?.quality).toBeUndefined()
  })

  it('requires sustained slow frames and can downgrade again after cooldown', () => {
    const monitor = createPointCloudPerformanceMonitor()
    let quality: 'high' | 'medium' | 'mobile' | 'fallback' = 'high'
    const changes: Array<{ time: number; quality: string }> = []
    for (let time = 0; time <= 22000; time += 100) {
      const result = monitor.record(time, true, quality)
      if (result?.quality) { quality = result.quality; changes.push({ time, quality }) }
    }
    expect(changes.map((change) => change.quality)).toEqual(['medium', 'fallback'])
    expect(changes[0]!.time).toBeGreaterThanOrEqual(6000)
    expect(changes[1]!.time - changes[0]!.time).toBeGreaterThanOrEqual(10000)
  })

  it('keeps mobile points soft but dark enough for a pale exhibition background', () => {
    const desktop = selectPointCloudPalette('high')

    expect(selectPointCloudPalette('medium')).toEqual(desktop)
    const mobile = selectPointCloudPalette('mobile')
    expect(mobile.jade).toEqual([.018, .18, .105])
    expect(mobile.copper).toEqual([.48, .24, .055])
    expect(mobile.opacity).toBe(.78)
    expect(mobile.opacity).toBeLessThan(desktop.opacity)
    expect(mobile.jade[1]).toBeGreaterThan(desktop.jade[1])
    expect(selectPointCloudPalette('fallback')).toEqual(mobile)
  })

  it('uses a brighter layered palette for mobile points in the dark hall', () => {
    const light = selectPointCloudPalette('mobile', 'light')
    const dark = selectPointCloudPalette('mobile', 'dark')

    expect(dark.jade).toEqual([.09, .58, .31])
    expect(dark.copper).toEqual([.92, .46, .09])
    expect(dark.copperBase).toBe(.16)
    expect(dark.copperRange).toBe(.18)
    expect(dark.opacity).toBe(.94)
    expect(dark.jade[1]).toBeGreaterThan(light.jade[1])
    expect(dark.copper[0]).toBeGreaterThan(light.copper[0])
    expect(selectPointCloudPalette('fallback', 'dark')).toEqual(dark)
    expect(selectPointCloudPalette('high', 'dark')).toEqual(selectPointCloudPalette('high', 'light'))
    expect(selectPointCloudPointSize('mobile', 'light')).toBe(.92)
    expect(selectPointCloudPointSize('mobile', 'dark')).toBe(1.16)
    expect(selectPointCloudPointSize('fallback', 'dark')).toBe(1.16)
    expect(selectPointCloudPointSize('high', 'dark')).toBe(1.25)
  })
})
