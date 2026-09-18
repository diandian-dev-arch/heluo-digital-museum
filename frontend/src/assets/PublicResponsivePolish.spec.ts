import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('public responsive polish', () => {
  const css = source('src/assets/public-responsive-polish.css')
  const viewer = source('src/components/ThreeExhibitViewer.vue')
  const pointCloudQuality = source('src/lib/pointCloudQuality.ts')

  it('loads after each affected route style owner', () => {
    expect(source('src/views/HomeView.vue')).toContain("import '../assets/public-responsive-polish.css'")
    expect(source('src/views/ExploreView.vue')).toMatch(/public-responsive-polish\.css'[\s\S]*explore-gallery\.css'/)
    expect(source('src/views/ShopView.vue')).toMatch(/control-surface-polish\.css'[\s\S]*public-responsive-polish\.css'/)
  })

  it('keeps mobile home card labels in flow and titles wrappable', () => {
    expect(css).toContain('grid-template-columns: 112px minmax(0, 1fr)')
    expect(css).toMatch(/\.corridor-home__object-card > span\s*{[^}]*position:\s*static/s)
    expect(css).toMatch(/\.corridor-home__object-card h2\s*{[^}]*overflow-wrap:\s*anywhere/s)
  })

  it('reduces the mobile discovery panel to one visual layer', () => {
    expect(css).toMatch(/\.collection-discovery::after,[\s\S]*\.collection-discovery__sun-rings[\s\S]*display:\s*none/s)
    expect(css).toMatch(/\.collection-discovery__search-card\.collection-discovery__search-card\s*{[^}]*border-radius:\s*8px\s*!important/s)
  })

  it('uses normal responsive product-card flow instead of positioned collage cards', () => {
    expect(css).toMatch(/\.shop-content \.product-grid\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s)
    expect(css).toMatch(/\.shop-content \.product-grid > article:nth-child\(3\)\s*{[^}]*position:\s*relative[^}]*grid-row:\s*auto/s)
    expect(css).toMatch(/\.shop-content \.product-grid > article:nth-child\(3\) \.product-image\s*{[^}]*display:\s*block/s)
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  })

  it('caps mobile point DPR and uses smaller soft-edged particles', () => {
    expect(viewer).toContain("quality === 'mobile' ? 1.25 : 2")
    expect(viewer).toContain('selectPointCloudPointSize(quality, sceneTheme)')
    expect(pointCloudQuality).toContain("return theme === 'dark' ? 1.16 : .92")
    expect(pointCloudQuality).toContain("if (quality !== 'mobile' && quality !== 'fallback') return 1.25")
    expect(viewer).toContain('pow(disc,1.25)*uPointOpacity')
  })
})
