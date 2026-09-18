/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const cssPath = resolve(process.cwd(), 'src/assets/main.css')
const srcPath = resolve(process.cwd(), 'src')
const css = [
  cssPath,
  resolve(process.cwd(), 'src/assets/route-admin-legacy.css'),
  resolve(process.cwd(), 'src/assets/route-exhibit-detail-legacy.css'),
  resolve(process.cwd(), 'src/assets/route-explore-legacy.css'),
].map(path => readFileSync(path, 'utf8')).join('\n')

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
    const end = css.indexOf('/* 2026-08-08 - Heluo dark mode')
    const contract = css.slice(start, end > start ? end : undefined)

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
    const start = css.indexOf('/* Semantic material contract.')
    const end = css.indexOf('/* 2026-08-08 - Heluo dark mode')
    const contract = css.slice(start, end > start ? end : undefined)

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

  it('keeps both admin navigation cards on the theme-aware glass tier', () => {
    const shell = readFileSync(resolve(process.cwd(), 'src/components/AdminShell.vue'), 'utf8')

    expect(shell).toContain(`to="/admin" :class="{ active: section === 'content' }" :data-glass="isDark ? 'dark' : 'light'" data-glass-interactive`)
    expect(shell).toContain(`to="/admin/operations" :class="{ active: section === 'operations' }" :data-glass="isDark ? 'dark' : 'light'" data-glass-interactive`)
    expect(css).toContain('.admin-sidebar nav a[data-glass="dark"].active')
    expect(css).toContain('background: var(--museum-glass-dark-sheen-hover), var(--museum-glass-dark-surface-hover);')
  })

  it('keeps the admin shell flush with the viewport instead of styling it as a rounded card', () => {
    const sidebarRule = css.match(/:is\(#app, body\) \.admin-sidebar\[data-glass\] \{([^}]+)\}/)?.[1]

    expect(sidebarRule).toContain('height: 100dvh;')
    expect(sidebarRule).toContain('border-block-width: 0;')
    expect(sidebarRule).toContain('border-inline-start-width: 0;')
    expect(sidebarRule).toContain('border-inline-end-width: 1px;')
    expect(sidebarRule).toContain('border-radius: 0;')
    expect(css).toContain('@media (max-width: 900px)')
    expect(css).toContain('border-block-end-width: 1px;')
  })

  it('registers public, account, exhibit, mobile and admin surfaces', () => {
    const sources = vueSources(srcPath).join('\n')
    const requiredMarkers = [
      'class="site-header" data-glass="light"',
      'class="home-cover"',
      'class="collection-filters gallery-filters"',
      'class="exhibits-intro" data-glass="light"',
      'class="exhibit-panel exhibit-panel-desktop" data-glass="dark"',
      'class="booking-page appointment-workbench"',
      'class="product-copy" data-glass="light"',
      'class="auth-panel" data-glass="dark"',
      'class="bottom-sheet" :class="panelClass" data-glass="light"',
      'class="admin-sidebar" :data-glass="isDark ? \'dark\' : \'light\'"',
      'class="dashboard-summary" data-glass="light"',
    ]

    for (const marker of requiredMarkers) expect(sources).toContain(marker)
  })
})
