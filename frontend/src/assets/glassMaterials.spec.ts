/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const cssPath = resolve(process.cwd(), 'src/assets/main.css')
const srcPath = resolve(process.cwd(), 'src')
const css = readFileSync(cssPath, 'utf8')

function vueSources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = join(path, entry.name)
    if (entry.isDirectory()) return vueSources(target)
    return extname(entry.name) === '.vue' ? [readFileSync(target, 'utf8')] : []
  })
}

describe('museum glass material contract', () => {
  it('defines each canonical tier token once', () => {
    const tokens = [
      'museum-glass-light-surface',
      'museum-glass-light-border',
      'museum-glass-light-shadow',
      'museum-glass-dark-surface',
      'museum-glass-dark-border',
      'museum-glass-dark-shadow',
      'museum-glass-compact-surface',
      'museum-glass-compact-border',
      'museum-glass-compact-shadow',
      'museum-glass-filter',
      'museum-glass-filter-compact',
      'museum-glass-radius',
      'museum-glass-radius-compact',
    ]

    for (const token of tokens) {
      expect(css.match(new RegExp(`--${token}\\s*:`, 'g'))).toHaveLength(1)
    }
  })

  it('keeps raw colors inside tokens, not semantic surface rules', () => {
    const start = css.indexOf('/* Semantic material contract.')
    const contract = css.slice(start)

    expect(start).toBeGreaterThan(-1)
    expect(contract).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/i)
    expect(contract).toContain('@media (forced-colors: active)')
    expect(contract).toContain('[data-glass-interactive]:disabled { cursor: not-allowed; opacity: .52; }')
    expect(css).not.toContain('--museum-glass-feature-')
  })

  it('prevents legacy feature-card rules from overriding the semantic tier', () => {
    expect(css).not.toMatch(/\.corridor-home__curation-heading[^{}]*\{[^}]*background:[^;}]+!important/i)
  })

  it('keeps the canonical glass translucent and low-saturation', () => {
    expect(css).toContain('--museum-glass-light-surface: oklch(97.2% .004 165 / .48);')
    expect(css).toContain('--museum-glass-dark-surface: oklch(24% .028 172 / .58);')
    expect(css).toContain('--museum-glass-compact-surface: oklch(97.3% .004 165 / .52);')
    expect(css).toContain('--museum-glass-filter: blur(30px) saturate(112%);')
    expect(css).toContain('--museum-glass-filter-compact: blur(18px) saturate(110%);')
  })

  it('separates reduced transparency from high contrast', () => {
    const contract = css.slice(css.indexOf('/* Semantic material contract.'))

    expect(contract).toContain('@media (prefers-reduced-transparency: reduce)')
    expect(contract).toContain('background: var(--glass-contract-sheen), var(--glass-contract-reduced);')
    expect(contract).toContain('@media (prefers-contrast: more)')
    expect(contract).not.toContain('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)')
  })

  it('uses only the three approved literal surface tiers', () => {
    const sources = vueSources(srcPath).join('\n')
    const tiers = [...sources.matchAll(/(?:^|\s)data-glass="([^"]+)"/gm)].map((match) => match[1])

    expect(new Set(tiers)).toEqual(new Set(['light', 'dark', 'compact']))
    expect(tiers.length).toBeGreaterThanOrEqual(30)
  })

  it('registers public, account, exhibit, mobile and admin surfaces', () => {
    const sources = vueSources(srcPath).join('\n')
    const requiredMarkers = [
      'class="site-header" data-glass="light"',
      'class="corridor-home__routes" data-glass="dark"',
      'class="collection-map" data-glass="light"',
      'class="exhibits-intro" data-glass="light"',
      'class="exhibit-panel exhibit-panel-desktop" data-glass="dark"',
      'class="booking-main" data-glass="light"',
      'class="product-copy" data-glass="light"',
      'class="auth-panel" data-glass="dark"',
      'class="bottom-sheet" data-glass="light"',
      'class="admin-sidebar" data-glass="dark"',
      'class="dashboard-summary" data-glass="light"',
    ]

    for (const marker of requiredMarkers) expect(sources).toContain(marker)
  })
})
