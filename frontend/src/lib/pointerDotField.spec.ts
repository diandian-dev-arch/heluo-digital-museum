import { describe, expect, it } from 'vitest'
import {
  DOT_FIELD_CONFIG,
  createDotFieldPoints,
  resetDotFieldTargets,
  resolveDotFieldRadius,
  selectHotGoldPoints,
  setDotFieldPointerTarget,
  settleDotFieldPoints,
} from './pointerDotField'

describe('pointer dot field geometry', () => {
  it('creates a stable, breathable grid with sparse bronze anchor nodes', () => {
    const first = createDotFieldPoints(360, 180)
    const second = createDotFieldPoints(360, 180)
    const bronzeRatio = first.filter((point) => point.bronze).length / first.length

    expect(first).toEqual(second)
    expect(first).toHaveLength(98)
    expect(bronzeRatio).toBeCloseTo(.08, 2)
    expect(first[1]!.baseX - first[0]!.baseX).toBe(DOT_FIELD_CONFIG.spacing)
    expect(first[0]).toMatchObject({ column: 0, row: 0, activity: 0, targetActivity: 0 })
  })

  it('clamps its radius and never exceeds the displacement or scale limits', () => {
    expect(resolveDotFieldRadius(1200, 700)).toBe(220)
    expect(resolveDotFieldRadius(900, 120)).toBe(150)
    expect(resolveDotFieldRadius(900, 240)).toBeCloseTo(172.8)

    const points = createDotFieldPoints(360, 180)
    setDotFieldPointerTarget(points, 180, 90, 4000, resolveDotFieldRadius(360, 180))
    points.forEach((point) => {
      expect(Math.hypot(point.targetX - point.baseX, point.targetY - point.baseY)).toBeLessThanOrEqual(DOT_FIELD_CONFIG.maxDisplacement)
      expect(point.targetScale).toBeLessThanOrEqual(DOT_FIELD_CONFIG.maxScale)
      expect(point.targetActivity).toBeLessThanOrEqual(1)
    })
  })

  it('forms a circular luminous wave without tangential twisting', () => {
    const points = createDotFieldPoints(440, 440)
    const radius = resolveDotFieldRadius(440, 440)
    setDotFieldPointerTarget(points, 220, 220, 1200, radius)

    const ringPoint = points.reduce((nearest, point) => (
      Math.abs(Math.hypot(point.baseX - 220, point.baseY - 220) - radius * DOT_FIELD_CONFIG.waveCenterRatio)
        < Math.abs(Math.hypot(nearest.baseX - 220, nearest.baseY - 220) - radius * DOT_FIELD_CONFIG.waveCenterRatio)
        ? point
        : nearest
    ))
    const centerPoint = points.reduce((nearest, point) => (
      Math.hypot(point.baseX - 220, point.baseY - 220)
        < Math.hypot(nearest.baseX - 220, nearest.baseY - 220)
        ? point
        : nearest
    ))

    expect(centerPoint.targetActivity).toBeGreaterThan(.6)
    expect(ringPoint.targetActivity).toBeGreaterThan(.5)
    expect(ringPoint.targetScale).toBeGreaterThan(1.5)
    const radialCross = (ringPoint.baseX - 220) * (ringPoint.targetY - ringPoint.baseY)
      - (ringPoint.baseY - 220) * (ringPoint.targetX - ringPoint.baseX)
    expect(Math.abs(radialCross)).toBeLessThan(.0001)
  })

  it('keeps the metallic heat core limited to five existing gold samples', () => {
    const points = createDotFieldPoints(540, 540)
    points.forEach((point, index) => { point.activity = index / points.length })
    const hot = selectHotGoldPoints(points)

    expect(hot.length).toBeLessThanOrEqual(5)
    expect(hot.every((point) => point.bronze)).toBe(true)
    expect(hot.every((point) => points.includes(point))).toBe(true)
    expect(hot.map((point) => point.activity)).toEqual([...hot].map((point) => point.activity).sort((a, b) => b - a))
  })

  it('settles on the pointer target and returns to its baseline', () => {
    const points = createDotFieldPoints(180, 90)
    setDotFieldPointerTarget(points, 90, 45, 800, 170)
    for (let index = 0; index < 120; index += 1) settleDotFieldPoints(points, 16.67, true)
    expect(settleDotFieldPoints(points, 16.67, true)).toBe(true)
    expect(points.some((point) => Math.hypot(point.x - point.baseX, point.y - point.baseY) > 1)).toBe(true)

    resetDotFieldTargets(points)
    for (let index = 0; index < 260; index += 1) settleDotFieldPoints(points, 16.67, false)
    expect(settleDotFieldPoints(points, 16.67, false)).toBe(true)
    expect(points.every((point) => Math.hypot(point.x - point.baseX, point.y - point.baseY) < .08)).toBe(true)
    expect(points.every((point) => point.activity < .004)).toBe(true)
  })
})
