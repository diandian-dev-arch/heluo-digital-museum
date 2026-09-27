export interface DotFieldPoint {
  column: number
  row: number
  baseX: number
  baseY: number
  x: number
  y: number
  targetX: number
  targetY: number
  scale: number
  targetScale: number
  activity: number
  targetActivity: number
  bronze: boolean
}

export const DOT_FIELD_CONFIG = {
  spacing: 27,
  jadeRadius: .72,
  bronzeRadius: 1.18,
  baseStrength: .7,
  speedStrength: 1.6,
  maxDisplacement: 2.6,
  maxSpeed: 1600,
  maxScale: 2.2,
  responseTauMs: 72,
  settleTauMs: 260,
  waveCenterRatio: .46,
  waveWidthRatio: .18,
  maxDpr: 1.5,
} as const

function isBronzePoint(column: number, row: number): boolean {
  return (column * 7 + row * 3) % 13 === 0
}

export function createDotFieldPoints(width: number, height: number): DotFieldPoint[] {
  const points: DotFieldPoint[] = []
  const spacing = DOT_FIELD_CONFIG.spacing
  const columns = Math.max(Math.ceil(width / spacing), 1)
  const rows = Math.max(Math.ceil(height / spacing), 1)
  const offsetX = (width - (columns - 1) * spacing) / 2
  const offsetY = (height - (rows - 1) * spacing) / 2

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const baseX = offsetX + column * spacing
      const baseY = offsetY + row * spacing
      points.push({
        column,
        row,
        baseX,
        baseY,
        x: baseX,
        y: baseY,
        targetX: baseX,
        targetY: baseY,
        scale: 1,
        targetScale: 1,
        activity: 0,
        targetActivity: 0,
        bronze: isBronzePoint(column, row),
      })
    }
  }

  return points
}

export function resolveDotFieldRadius(width: number, height: number): number {
  return Math.min(Math.max(Math.min(width, height) * .72, 150), 220)
}

export function setDotFieldPointerTarget(
  points: DotFieldPoint[],
  pointerX: number,
  pointerY: number,
  speed: number,
  radius: number,
) {
  const speedRatio = Math.min(Math.max(speed, 0), DOT_FIELD_CONFIG.maxSpeed) / DOT_FIELD_CONFIG.maxSpeed
  const strength = DOT_FIELD_CONFIG.baseStrength + DOT_FIELD_CONFIG.speedStrength * speedRatio

  points.forEach((point, index) => {
    const offsetX = point.baseX - pointerX
    const offsetY = point.baseY - pointerY
    const distance = Math.hypot(offsetX, offsetY)
    if (distance >= radius) {
      point.targetX = point.baseX
      point.targetY = point.baseY
      point.targetScale = 1
      point.targetActivity = 0
      return
    }

    const falloff = 1 - distance / radius
    const influence = falloff * falloff * (3 - 2 * falloff)
    const waveCenter = radius * DOT_FIELD_CONFIG.waveCenterRatio
    const waveWidth = radius * DOT_FIELD_CONFIG.waveWidthRatio
    const waveDistance = (distance - waveCenter) / waveWidth
    const wave = Math.exp(-(waveDistance * waveDistance))
    const coreDistance = distance / (radius * .24)
    const core = Math.exp(-(coreDistance * coreDistance))
    const fallbackAngle = index * 2.399963229728653
    const directionX = distance > .001 ? offsetX / distance : Math.cos(fallbackAngle)
    const directionY = distance > .001 ? offsetY / distance : Math.sin(fallbackAngle)
    const radialDisplacement = strength * wave * (.58 + speedRatio * .42)
    const displacementX = directionX * radialDisplacement
    const displacementY = directionY * radialDisplacement
    const displacementLength = Math.hypot(displacementX, displacementY)
    const displacementScale = displacementLength > DOT_FIELD_CONFIG.maxDisplacement
      ? DOT_FIELD_CONFIG.maxDisplacement / displacementLength
      : 1
    const activity = Math.min(1, core * .72 + wave * .56 + influence * .12)
    point.targetX = point.baseX + displacementX * displacementScale
    point.targetY = point.baseY + displacementY * displacementScale
    point.targetScale = 1 + (DOT_FIELD_CONFIG.maxScale - 1) * activity
    point.targetActivity = activity
  })
}

export function resetDotFieldTargets(points: DotFieldPoint[]) {
  points.forEach((point) => {
    point.targetX = point.baseX
    point.targetY = point.baseY
    point.targetScale = 1
    point.targetActivity = 0
  })
}

export function selectHotGoldPoints(
  points: DotFieldPoint[],
  limit = 5,
  minimumActivity = .28,
): DotFieldPoint[] {
  return points
    .filter((point) => point.bronze && point.activity >= minimumActivity)
    .sort((left, right) => right.activity - left.activity)
    .slice(0, limit)
}

export function settleDotFieldPoints(points: DotFieldPoint[], deltaMs: number, pointerInside: boolean): boolean {
  const tauMs = pointerInside ? DOT_FIELD_CONFIG.responseTauMs : DOT_FIELD_CONFIG.settleTauMs
  const alpha = 1 - Math.exp(-Math.max(deltaMs, 0) / tauMs)
  let settled = true

  points.forEach((point) => {
    point.x += (point.targetX - point.x) * alpha
    point.y += (point.targetY - point.y) * alpha
    point.scale += (point.targetScale - point.scale) * alpha
    point.activity += (point.targetActivity - point.activity) * alpha
    if (
      Math.abs(point.targetX - point.x) > .08
      || Math.abs(point.targetY - point.y) > .08
      || Math.abs(point.targetScale - point.scale) > .004
      || Math.abs(point.targetActivity - point.activity) > .004
    ) settled = false
  })

  return settled
}
