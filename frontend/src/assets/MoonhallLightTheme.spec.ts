import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')

describe('Moonlit Hall light-theme contracts', () => {
  const baseCss = source('src/assets/moonhall-light.css')
  const routeExhibitCss = source('src/assets/route-exhibit-detail-legacy.css')
  const css = [
    baseCss,
    'src/assets/route-admin-legacy.css',
    routeExhibitCss,
    'src/assets/route-explore-legacy.css',
  ].map(pathOrSource => pathOrSource.endsWith('.css') ? source(pathOrSource) : pathOrSource).join('\n')

  it('stays global while Explore ownership is route-scoped and keeps dark mode outside the override', () => {
    const entry = source('src/main.ts')
    const explore = source('src/views/ExploreView.vue')
    expect(entry.indexOf("'./assets/theme-controls.css'")).toBeGreaterThan(entry.indexOf("'./assets/moonhall-light.css'"))
    expect(entry).not.toContain("'./assets/task-pages.css'")
    expect(entry).not.toContain("'./assets/explore-reference.css'")
    expect(explore).toContain("import '../assets/explore-gallery.css'")
    expect(baseCss).toContain('html:not([data-theme="dark"])')
    expect(baseCss).not.toContain('html[data-theme="dark"]')
  })

  it('defines four visibly different light materials for canvas, section, content and controls', () => {
    expect(css).toContain('--moonhall-canvas:')
    expect(css).toContain('--moonhall-section:')
    expect(css).toContain('--moonhall-content:')
    expect(css).toContain('--moonhall-control:')
    expect(css).toContain('--theme-surface-section: var(--moonhall-section)')
    expect(css).toContain('--theme-surface-content: var(--moonhall-content)')
    expect(css).toContain('--theme-surface-control: var(--moonhall-control)')
    expect(css).toContain('--glass-contract-sheen: none')
    expect(css).toContain('--glass-contract-filter: none')
  })

  it('gives the home artifacts a contained material stage instead of a raw cut-out treatment', () => {
    expect(css).toContain('.corridor-home__object-card img')
    expect(css).toContain('mix-blend-mode: normal !important')
    expect(css).toContain('background: var(--moonhall-control)')
    expect(css).toContain('filter: saturate(.86) contrast(.96)')
  })

  it('turns collection copy panels into warm paper while keeping object media as the dark stage', () => {
    expect(css).toContain('.artifact-tile-copy')
    expect(css).toContain('background: var(--moonhall-content) !important')
    expect(css).toContain('background-image: none !important')
    expect(css).toContain('--moonhall-media')
    expect(css).toContain('.artifact-tile > img')
  })

  it('makes the exhibit Dock mode and route labels readable at desktop and mobile sizes', () => {
    expect(css).toContain('font: 600 .82rem/1.3 var(--font-body) !important')
    expect(css).toContain('font: 650 .84rem/1.2 var(--font-body) !important')
    expect(css).toContain('min-height: 42px')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('.dock-mode-switch[data-mode="points"] button:last-child')
    expect(routeExhibitCss).toMatch(/\.immersive-exhibit \.tour-route li button\s*\{[^}]*color:\s*var\(--moonhall-text\) !important;/s)
    expect(routeExhibitCss).not.toMatch(/\.dock-mode-switch span\s*\{[^}]*min-height:/s)
    expect(routeExhibitCss).toMatch(/\.dock-mode-switch\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.8fr\) minmax\(0, 1\.2fr\)/s)
    expect(routeExhibitCss).toMatch(/\.dock-mode-switch::before\s*\{[^}]*display:\s*none/s)
    expect(routeExhibitCss).toMatch(/html #app \.immersive-exhibit \.dock-mode-switch\s*\{[^}]*border-radius:\s*8px !important/s)
    expect(routeExhibitCss).toMatch(/html #app \.immersive-exhibit \.dock-mode-switch\[data-galaxy-segmented\] > button\s*\{[^}]*min-height:\s*44px;[^}]*overflow:\s*hidden;[^}]*border:\s*0 !important;[^}]*border-radius:\s*5px !important/s)
    expect(routeExhibitCss).toMatch(/@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*\.dock-mode-switch svg\s*\{[^}]*display:\s*none/s)
    expect(routeExhibitCss).toMatch(/@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*\.dock-mode-switch span\s*\{[^}]*white-space:\s*normal/s)
    expect(routeExhibitCss).toMatch(/@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*\.exhibit-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.95fr\) minmax\(0, 1\.4fr\)/s)
    expect(routeExhibitCss).toMatch(/@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*\.exhibit-dock\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*var\(--exhibit-dock-height\)/s)
    expect(routeExhibitCss).toMatch(/@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*\.tour-route ol\s*\{[^}]*overflow-x:\s*auto/s)
  })

  it('keeps booking discovery on the mineral field and form values on denser control surfaces', () => {
    expect(css).toContain('.booking-main[data-glass="light"]')
    expect(css).toContain('.booking-side[data-glass="light"]')
    expect(css).toContain('.date-strip')
    expect(css).toContain('.slot-list button')
    expect(css).toContain('.appointment-form :is(input, textarea, .booking-summary .visitor-count input)')
  })

  it('keeps the light profile account surface on paper while preserving the night contract', () => {
    expect(css).toContain('.auth-page.profile-page .profile-account-panel[data-glass]')
    expect(css).toContain('.auth-page.profile-page .profile-account-panel[data-glass="dark"]')
    expect(css).toContain('background: var(--moonhall-content)')
    expect(css).toContain('.profile-form label')
    expect(css).toContain('color: var(--moonhall-ink) !important')
  })
})
