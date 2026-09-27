/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = [
  'main.css',
  'route-admin-legacy.css',
  'route-exhibit-detail-legacy.css',
  'route-explore-legacy.css',
].map(path => readFileSync(resolve(process.cwd(), 'src/assets', path), 'utf8')).join('\n')
const interactionCss = readFileSync(resolve(process.cwd(), 'src/assets/interaction.css'), 'utf8')
const homeView = readFileSync(resolve(process.cwd(), 'src/views/HomeView.vue'), 'utf8')

describe('dark theme cohesion contract', () => {
  it('uses a dedicated Image 2 night scene instead of dimming the light hero', () => {
    expect(existsSync(resolve(process.cwd(), 'public/media/editorial/home-corridor-dark-user-v2.webp'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'public/media/editorial/home-corridor-dark-user-v2-1280w.webp'))).toBe(true)
    expect(homeView).toContain("src: '/media/editorial/home-corridor-dark-user-v2.webp'")
    expect(homeView).toContain('home-corridor-dark-user-v2-portrait.webp 483w')
  })

  it('keeps paired home and shop scenes on stable shared frames', () => {
    expect(css).toMatch(/\.corridor-home__hero\s*\{[^}]*min-height:\s*min\(680px, calc\(100dvh - 74px\)\)/s)
    expect(css).not.toMatch(/html\[data-theme="dark"\] \.corridor-home__hero\s*\{[^}]*min-height:/s)
    expect(css).not.toContain('html[data-theme="dark"] .corridor-home__hero { min-height: 500px; }')
    expect(css).not.toContain('html[data-theme="dark"] .corridor-home__hero { min-height: 620px; }')
    expect(css).not.toMatch(/html\[data-theme="dark"\] \.corridor-home__hero\s*\{[^}]*background-size:\s*130% auto/s)
    expect(css).toMatch(/html\[data-theme="dark"\] \.shop-object-studio-surface\s*\{[^}]*background-size:\s*auto, auto 100%/s)
  })

  it('keeps the home location credit fixed when the theme changes', () => {
    expect(css).toMatch(/\.corridor-home__location\s*\{[^}]*right:\s*clamp\(2\.5rem, 7vw, 9rem\)[^}]*bottom:\s*1\.3rem/s)
    expect(css).not.toMatch(/html\[data-theme="dark"\] \.corridor-home__location\s*\{[^}]*\bright\s*:/s)
  })

  it('keeps the reference-inspired home body scoped and the public header shared', () => {
    for (const selector of [
      'html[data-theme="dark"] .app-shell > .site-header',
      'html[data-theme="dark"] .corridor-home__hero',
      'html[data-theme="dark"] #app .corridor-home__hero-cta',
      'html[data-theme="dark"] .corridor-home__routes',
      'html[data-theme="dark"] .corridor-home__curation.home-experiences',
    ]) expect(css).toContain(selector)

    expect(css).toMatch(/\.corridor-home__hero-cta\s*\{[^}]*display:\s*inline-flex/s)
    expect(css).not.toContain('.app-shell:has(.corridor-home) > .site-header')
    expect(css).toContain('html[data-theme="dark"] #app .app-shell > .site-header')
    expect(css).toContain('@media (max-width: 760px) and (max-height: 700px)')
  })

  it('uses the approved Image 2 media stage to unify home and collection cards', () => {
    expect(existsSync(resolve(process.cwd(), 'public/media/editorial/heluo-card-atmosphere-image2-v1.webp'))).toBe(true)
    expect(css).toContain("url('/media/editorial/heluo-card-atmosphere-image2-v1.webp')")
    for (const selector of [
      '.corridor-home__object-card',
      '.collection-page .artifact-tile::before',
      '.collection-stories .story-card__media::before',
    ]) expect(css).toContain(selector)
  })

  it('defines shared dark canvas, media and input layers', () => {
    for (const token of [
      '--theme-dark-canvas',
      '--theme-dark-canvas-raised',
      '--theme-dark-media-surface',
      '--theme-dark-media-border',
      '--theme-dark-input-surface',
      '--theme-dark-row-hover',
    ]) expect(css).toContain(token)
  })

  it('keeps the dominant dark palette neutral and reserves jade for semantic status', () => {
    expect(css).toContain('--color-paper: oklch(12.5% .006 78)')
    expect(css).toContain('--color-surface: oklch(19% .009 78)')
    expect(css).toContain('--color-action: oklch(72% .09 76)')
    expect(css).toContain('--dark-reference-canvas: oklch(22% .009 165)')
    expect(css).toMatch(/html\[data-theme="dark"\] :is\(\.collection-page,[^}]*background-image:\s*linear-gradient\(135deg, oklch\(13% \.008 78\)/s)
    expect(css).toMatch(/html\[data-theme="dark"\] \.auth-page\s*\{[^}]*oklch\(5% \.005 78/s)
    expect(css).toMatch(/html\[data-theme="dark"\] \.shop-content\s*\{[^}]*oklch\(5% \.005 78/s)
    expect(css).toMatch(/html\[data-theme="dark"\] \.museum-search-field__submit\s*\{[^}]*var\(--dark-reference-bronze\)/s)
  })

  it('keeps the shared search single-layer and the collection filters inside their rail', () => {
    const search = readFileSync(resolve(process.cwd(), 'src/components/MuseumSearchField.vue'), 'utf8')
    expect(search).not.toContain('<form class="museum-search-field" data-glass=')
    expect(search).toContain('class="museum-search-field__control" :class="{ \'has-clear\': Boolean(modelValue) }" data-glass="compact"')
    expect(search).not.toContain('class="museum-search-field__icon"')
    expect(css).toMatch(/\.museum-search-field__control\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 44px auto/s)
    expect(css).toMatch(/\.collection-page \.museum-search-field\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s)
    expect(css).toMatch(/html\[data-theme="dark"\] :is\(#app, body\) \.collection-page \.museum-search-field\s*\{[^}]*background:\s*transparent/s)
    expect(css).toMatch(/\.collection-page \.museum-search-field input\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s)
    expect(css).toContain('.collection-filters { display: flex; min-height: 44px; height: auto;')
    expect(css).not.toContain('.collection-filters { display: flex; height: 40px;')
  })

  it('uses neutral graphite and restrained bronze for dark admin navigation', () => {
    expect(css).toMatch(/html\[data-theme="dark"\] :is\(#app, body\) \.admin-sidebar nav a\[data-glass="dark"\]\s*\{[^}]*oklch\(19% \.009 78[^}]*oklch\(12% \.007 78/s)
    expect(css).toMatch(/html\[data-theme="dark"\] :is\(#app, body\) \.admin-sidebar nav a\[data-glass="dark"\]\.active\s*\{[^}]*oklch\(24% \.018 76[^}]*oklch\(13% \.009 78/s)
    expect(css).toContain('.admin-sidebar nav a[data-glass="dark"].active::after { background: var(--dark-reference-bronze); }')
  })

  it('covers public media stages, booking, shop and admin workspace', () => {
    for (const selector of [
      'html[data-theme="dark"] .collection-page .artifact-tile',
      'html[data-theme="dark"] .exhibits-page .exhibit-grid > a',
      'html[data-theme="dark"] .booking-main',
      'html[data-theme="dark"] .shop-content',
      'html[data-theme="dark"] .admin-workspace',
      'html[data-theme="dark"] .admin-page-header',
      'html[data-theme="dark"] #app .admin-workspace .admin-inline-form',
      'html[data-theme="dark"] #app .admin-workspace .admin-list--operations article',
    ]) expect(css).toContain(selector)
  })

  it('keeps the 3D gallery dark without turning the model canvas opaque', () => {
    expect(css).toMatch(/html\[data-theme="dark"\] \.immersive-exhibit \.exhibit-scene\s*\{[^}]*background-image:\s*linear-gradient\(90deg, oklch\(3% \.006 78 \/ \.86\)/s)
    expect(css).toMatch(/html\[data-theme="dark"\] \.immersive-exhibit \.exhibit-scene\s*\{[^}]*digital-gallery-hall\.webp/s)
    expect(css).toMatch(/html\[data-theme="dark"\] \.immersive-exhibit \.exhibit-scene\s*\{[^}]*background-position:\s*center/s)
    expect(css).toContain('html[data-theme="dark"] .immersive-exhibit .exhibit-scene-label')
    expect(css).toContain('color: var(--dark-reference-ivory)')
    expect(css).toContain('text-shadow: 0 1px 12px var(--dark-reference-canvas)')
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?html\[data-theme="dark"\] \.immersive-exhibit \.exhibit-scene::before\s*\{[^}]*oklch\(4% \.018 164 \/ \.24\)/s)
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?html\[data-theme="dark"\] \.immersive-exhibit \.exhibit-scene\s*\{[^}]*oklch\(5% \.018 164 \/ \.84\)/s)
  })

  it('keeps the 3D dock controls and document root in the dark palette', () => {
    const controls = readFileSync(resolve(process.cwd(), 'src/assets/theme-controls.css'), 'utf8')
    expect(controls).toContain('html[data-theme="dark"] {')
    expect(controls).toContain('background-color: var(--theme-canvas) !important;')
    expect(css).toContain('html[data-theme="dark"] .immersive-exhibit .view-switcher button')
    expect(css).toContain('background: var(--dark-reference-surface-strong);')
    expect(css).toContain('html[data-theme="dark"] .immersive-exhibit .dock-mode-switch button.active')
    expect(css).toContain('color: var(--dark-reference-canvas) !important;')
  })

  it('uses the dedicated Image 2 night store scene', () => {
    expect(existsSync(resolve(process.cwd(), 'public/media/editorial/museum-store-dark-image2-v1.webp'))).toBe(true)
    expect(css).toContain("url('/media/editorial/museum-store-dark-image2-v1.webp')")
    expect(css).toMatch(/html\[data-theme="dark"\] \.shop-content\s*\{[^}]*museum-store-dark-image2-v1\.webp/s)
  })

  it('keeps tablet navigation reachable and dark controls touch-sized', () => {
    expect(css).toContain('@media (min-width: 761px) and (max-width: 900px)')
    expect(css).toMatch(/@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*?\.mobile-tab-bar\s*\{[^}]*display:\s*grid/s)
    expect(css).toMatch(/html\[data-theme="dark"\] :is\([\s\S]*?\.site-header \.theme-toggle[\s\S]*?\)\s*\{ min-height: 44px; \}/s)
  })

  it('gives loading and content-detail states a dark editorial surface', () => {
    for (const selector of [
      '.loading-skeleton',
      '.loading-skeleton__title',
      '.loading-skeleton__line',
      '.detail-state.state-panel--action > a',
      '.detail-page-shell',
      '.detail-page .back-link',
      '.detail-reading',
      '.related-exhibits',
      '.related-exhibit',
      '.detail-cta',
      'html[data-theme="dark"] .detail-header > img',
      'html[data-theme="dark"] .related-exhibit',
      'html[data-theme="dark"] .detail-cta',
      'html[data-theme="dark"] .search-results .content-card',
      'html[data-theme="dark"] .search-results .content-card > div',
    ]) expect(css).toContain(selector)

    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toMatch(/\.detail-state\.state-panel--action > a\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.detail-page \.back-link\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.detail-cta a\s*\{[^}]*min-height:\s*44px/s)
  })

  it('applies the night store asset to the visible desktop studio layer', () => {
    expect(css).toMatch(/html\[data-theme="dark"\] \.shop-object-studio-surface\s*\{[^}]*museum-store-dark-image2-v1\.webp/s)
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.search-results \.content-card\s*\{[^}]*grid-template-columns/s)
  })

  it('keeps async errors exclusive from empty content and fixes admin danger controls', () => {
    const explore = readFileSync(resolve(process.cwd(), 'src/views/ExploreView.vue'), 'utf8')
    const exhibits = readFileSync(resolve(process.cwd(), 'src/views/ExhibitsView.vue'), 'utf8')
    const shop = readFileSync(resolve(process.cwd(), 'src/views/ShopView.vue'), 'utf8')
    expect(explore).toContain('const submittedQuery = ref')
    expect(explore).toContain('v-if="hasSubmittedSearch"')
    expect(explore).toContain('v-else-if="contentError"')
    expect(explore).toContain('v-else-if="searchError"')
    expect(exhibits).toContain('v-else-if="!error && items.length===0"')
    expect(shop).toContain('v-else-if="productError"')
    expect(shop).toContain('const cartPanelError = computed')
    expect(css).toContain('html[data-theme="dark"] #app .admin-workspace .admin-action-button--danger')
    expect(css).toMatch(/:is\([\s\S]*?\.skip-link[\s\S]*?\.admin-sidebar__exit[\s\S]*?\) \{ min-height: 44px; \}/s)
    expect(css).toMatch(/\.content-search__clear\s*\{[^}]*min-height:\s*44px/s)
    expect(interactionCss).toMatch(/\.quantity\s*\{[^}]*44px 36px 44px/s)
    expect(interactionCss).toMatch(/\.bottom-sheet-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s)
    expect(css).toMatch(/\.fluid-button,\s*\n\.product-grid \.fluid-button,\s*\n\.auth-panel \.fluid-button\s*\{ min-height: 44px; \}/s)
    expect(css).toMatch(/:is\(\.theme-toggle, \.locale-toggle\)\s*\{ min-width: 44px; \}/s)
  })

  it('keeps Explore media and geometry stable across themes', () => {
    const explore = readFileSync(resolve(process.cwd(), 'src/views/ExploreView.vue'), 'utf8')
    const button = readFileSync(resolve(process.cwd(), 'src/components/FluidButton.vue'), 'utf8')
    expect(existsSync(resolve(process.cwd(), 'public/media/editorial/explore-jade-bi-user-v2.webp'))).toBe(true)
    expect(explore).toContain('const editorialArtifactMedia')
    expect(explore).toContain("'river-map-jade-bi': '/media/editorial/explore-jade-bi-user-v2.webp'")
    expect(explore).toContain('return editorialArtifactMedia[artifact.slug] ?? artifact.coverImageUrl')
    expect(explore).toContain(':media-src="searchVisual(item)"')
    expect(explore).not.toContain("import { useTheme } from '../stores/theme'")
    expect(explore).toContain('class="gallery-themes"')
    expect(explore).toContain('gallery-object__media')
    expect(explore).toContain('categoryName(category)')
    expect(explore).not.toContain('class="map-gridline"')
    expect(explore).not.toContain('class="collection-map"')
    expect(explore).not.toContain('preserveAspectRatio="none"')
    expect(css).toContain('html[data-theme="light"] #app .collection-page .collection-map[data-glass="light"]')
    expect(css).toContain('html[data-theme="dark"] #app .collection-page .collection-map[data-glass="light"]')
    expect(css).toMatch(/html\[data-theme="light"\] #app \.collection-page \.collection-map__header,\s*html\[data-theme="dark"\] #app \.collection-page \.collection-map__header\s*\{[^}]*position:\s*absolute[^}]*top:\s*\.85rem[^}]*left:\s*1rem/s)
    expect(css).toMatch(/html\[data-theme="light"\] #app \.collection-page \.collection-map svg,\s*html\[data-theme="dark"\] #app \.collection-page \.collection-map svg\s*\{[^}]*position:\s*absolute[^}]*top:\s*3\.45rem[^}]*width:\s*calc\(100% - 2rem\)[^}]*height:\s*calc\(100% - 3\.9rem\)/s)
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*html\[data-theme="light"\] #app \.collection-page \.collection-map text,\s*html\[data-theme="dark"\] #app \.collection-page \.collection-map text\s*\{[^}]*font-size:\s*20px/s)
    expect(css).toContain('height: 224px;')
    expect(css).toContain('grid-template-rows: 44px 44px;')
    expect(css).toContain('grid-template-rows: 250px 210px;')
    expect(css).toContain('line-height: 1.04;')
    expect(css).toContain('grid-template-columns: 190px minmax(0, 1fr);')
    expect(css).toContain('background: #0d1816;')
    expect(css).toContain('color: #17352f !important;')
    expect(css).toContain('transform: translateX(-125%) skewX(-16deg);')
    expect(button).toContain('<button')
    expect(button).toContain('data-tactile-button')
    expect(button).not.toContain('motion-v')
    expect(button).not.toContain('y: 1')
  })
})
