/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/assets/pointer-motion.css'), 'utf8')

describe('pointer motion visual prominence', () => {
  it('keeps the full-tier cursor compact while preserving the spotlight', () => {
    expect(css).toContain('--cursor-ring-size: 28px;')
    expect(css).toContain('--cursor-ring-interactive-size: 38px;')
    expect(css).toContain('--cursor-ring-action-size: 42px;')
    expect(css).toContain('--pointer-spotlight-radius: 240px;')
    expect(css).toContain('--pointer-spotlight-strength: .14;')
    expect(css).toContain('radial-gradient(circle 48px at var(--pointer-x) var(--pointer-y)')
  })

  it('keeps accessibility modes able to suppress visual pointer motion', () => {
    expect(css).toContain('(prefers-reduced-motion: reduce)')
    expect(css).toContain('(prefers-contrast: more)')
    expect(css).toContain('(forced-colors: active)')
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
  })
})
