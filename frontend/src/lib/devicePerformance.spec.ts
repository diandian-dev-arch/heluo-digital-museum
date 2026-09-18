import { describe, expect, it } from 'vitest'
import { selectDevicePerformanceTier } from './devicePerformance'

describe('device performance tier', () => {
  it('keeps capable desktop devices on the full visual tier', () => {
    expect(selectDevicePerformanceTier({ width: 1440, coarsePointer: false, cores: 8, memoryGiB: 8, effectiveType: '4g' })).toBe('full')
  })

  it.each([
    { width: 390, coarsePointer: false },
    { width: 1024, coarsePointer: true },
    { width: 1440, coarsePointer: false, saveData: true },
    { width: 1440, coarsePointer: false, effectiveType: '3g' },
    { width: 1440, coarsePointer: false, cores: 4 },
    { width: 1440, coarsePointer: false, memoryGiB: 4 },
  ])('uses the constrained tier for mobile or resource-limited contexts: %o', (context) => {
    expect(selectDevicePerformanceTier(context)).toBe('constrained')
  })
})
