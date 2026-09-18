/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(resolve(root, 'src/assets/mobile-performance.css'), 'utf8')
const routeExhibitCss = readFileSync(resolve(root, 'src/assets/route-exhibit-detail-legacy.css'), 'utf8')
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
const globalMainCss = readFileSync(resolve(root, 'src/assets/main.css'), 'utf8')

const routeOwners = [
  ['src/views/ExploreView.vue', "import '../assets/explore-gallery.css'"],
  ['src/views/ExhibitDetailView.vue', "import '../assets/route-exhibit-detail-legacy.css'"],
  ['src/views/AdminContentView.vue', "import '../assets/route-admin-legacy.css'"],
  ['src/views/AdminOperationsView.vue', "import '../assets/route-admin-legacy.css'"],
] as const

describe('mobile performance CSS contract', () => {
  it('loads after the shared visual sheets', () => {
    expect(main.indexOf("import './assets/mobile-performance.css'"))
      .toBeGreaterThan(main.indexOf("import './assets/light-ui-material-depth.css'"))
  })

  it('removes glass compositing for coarse pointers and constrained devices', () => {
    expect(css).toMatch(/@media \(pointer: coarse\)[\s\S]*\[data-glass\][\s\S]*backdrop-filter:\s*none !important/)
    expect(css).toMatch(/html body #app :is\(\[data-glass\], \.bottom-sheet-scrim, \.fluid-button\)[\s\S]*backdrop-filter:\s*none !important/)
    expect(css).toMatch(/html body #app \[data-glass-controls\] :is\(input, textarea, select, \.el-select__wrapper\)[\s\S]*backdrop-filter:\s*none !important/)
    expect(css).toMatch(/html\[data-performance-tier="constrained"\][\s\S]*\[data-glass\][\s\S]*backdrop-filter:\s*none !important/)
    expect(css).toContain('.bottom-sheet-scrim')
    expect(routeExhibitCss).toContain('.three-overlay')
  })

  it('keeps the hero media stable and defers the below-fold home ending', () => {
    expect(css).toMatch(/\.corridor-home__hero-media\s*\{[^}]*object-fit:\s*cover/s)
    expect(css).toMatch(/\.corridor-home__next\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:/s)
    expect(css).toMatch(/\.corridor-home__curation > :not\(\.corridor-home__curation-heading\)[\s\S]*content-visibility:\s*auto/)
    expect(css).toMatch(/\.collection-browse :is\(\.artifact-feature, \.artifact-card\)[\s\S]*contain-intrinsic-size:/)
    expect(css).toMatch(/\.collection-theme-path,[\s\S]*\.collection-reading[\s\S]*contain-intrinsic-size:/)
    expect(css).toMatch(/\.auth-page\.profile-page \.profile-record-card\s*\{[^}]*content-visibility:\s*auto[^}]*contain-intrinsic-size:/s)
  })

  it('isolates repeated appointment controls on mobile without removing them', () => {
    expect(css).toMatch(/\.booking-page \.slot-list > button\s*\{[^}]*contain:\s*layout paint style/s)
  })

  it('keeps admin, Explore, and interactive 3D legacy rules route-owned', () => {
    expect(globalMainCss).not.toMatch(/\.(?:admin-|dashboard-summary|collection-|immersive-exhibit|exhibit-(?:scene|viewer|panel|dock|loader)|three-viewer)/)
    expect(main).not.toContain('route-admin-legacy.css')
    expect(main).not.toContain('route-explore-legacy.css')
    expect(main).not.toContain('route-exhibit-detail-legacy.css')

    for (const [path, routeImport] of routeOwners) {
      expect(readFileSync(resolve(root, path), 'utf8')).toContain(routeImport)
    }
  })
})
