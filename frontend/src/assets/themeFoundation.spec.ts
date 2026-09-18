/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const tokens = read('src/assets/tokens.css')
const glass = read('src/assets/glass.css')
const controls = read('src/assets/theme-controls.css')
const entry = read('src/main.ts')

describe('theme foundation and shared controls contract', () => {
  it('defines four semantic surface layers and shared control states', () => {
    for (const token of [
      '--theme-surface-canvas',
      '--theme-surface-section',
      '--theme-surface-content',
      '--theme-surface-control',
      '--theme-primary-surface',
      '--theme-secondary-surface',
      '--theme-danger-surface',
      '--theme-success-surface',
      '--theme-warning-surface',
      '--theme-focus-ring',
    ]) expect(tokens).toContain(token)
  })

  it('keeps the three glass layers semantic and provides solid fallbacks', () => {
    expect(glass).toContain('[data-glass="light"]')
    expect(glass).toContain('[data-glass="dark"]')
    expect(glass).toContain('[data-glass="compact"]')
    expect(glass).toContain('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
    expect(glass).toContain('@media (forced-colors: active)')
    expect(glass).toContain('background: var(--theme-surface-content)')
  })

  it('loads the shared theme control layer after legacy page styling', () => {
    expect(entry.indexOf("import './assets/theme-controls.css'")).toBeGreaterThan(entry.indexOf("import './assets/pointer-motion.css'"))
  })

  it('gives shared controls theme semantics, touch size and visible focus', () => {
    for (const selector of [
      '.fluid-button',
      '.admin-action-button',
      '.inline-status',
      '.status-badge',
      '.glass-checkbox__box',
      '.museum-search-field__control',
    ]) expect(controls).toContain(selector)

    expect(controls).toContain('min-height: var(--theme-control-min)')
    expect(controls).toContain('outline: 2px solid var(--theme-focus)')
    expect(controls).toContain('@media (prefers-reduced-motion: reduce)')
    expect(controls).toContain('@media (forced-colors: active)')
  })
})
