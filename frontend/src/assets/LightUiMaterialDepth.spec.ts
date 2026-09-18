import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('light UI material depth contract', () => {
  const baseCss = read('src/assets/light-ui-material-depth.css')
  const css = [
    baseCss,
    'src/assets/route-admin-legacy.css',
    'src/assets/route-exhibit-detail-legacy.css',
    'src/assets/route-explore-legacy.css',
  ].map(pathOrSource => pathOrSource.endsWith('.css') ? read(pathOrSource) : pathOrSource).join('\n')
  const entry = read('src/main.ts')

  it('loads as the final visual layer and is scoped away from dark mode', () => {
    expect(entry.indexOf("import './assets/light-ui-material-depth.css'")).toBeGreaterThan(entry.indexOf("import './assets/tactile-ui.css'"))
    expect(baseCss).toContain('html:not([data-theme="dark"])')
    expect(baseCss).not.toContain('html[data-theme="dark"]')
  })

  it('uses the mineral cut edge, sage action, and restrained bronze detail contract', () => {
    expect(css).toContain('--light-ui-face:')
    expect(css).toContain('--light-ui-face-gradient:')
    expect(css).toContain('--light-ui-stone-edge:')
    expect(css).toContain('--light-ui-cut-seam:')
    expect(css).toContain('--light-ui-jade:')
    expect(css).toContain('--light-ui-bronze:')
    expect(css).toContain('var(--light-ui-card-shadow)')
    expect(css).toContain('linear-gradient(145deg')
    expect(css).not.toMatch(/0 0 0 [234]px var\(--light-ui-(jade|jade-deep|jade-mid)\)/)
    expect(css).toContain('outline: 0 !important')
    expect(css).toContain('):focus-visible {')
    expect(css).toContain('outline-offset: 5px')
    expect(css).not.toContain('inset 0 -5px 0')
    expect(css).not.toContain('light-ui-a-')
  })

  it('keeps search and native fields physically distinct', () => {
    expect(css).toContain('--light-ui-recess-shadow:')
    expect(css).toContain('[data-tactile-search] .museum-search-field__control')
    expect(css).toContain('box-shadow: var(--light-ui-recess-shadow) !important')
    expect(css).toContain('data-tactile-checkbox')
    expect(css).toContain('input:indeterminate + .glass-checkbox__box')
  })

  it('keeps shop products on a single visible card surface', () => {
    expect(css).toContain('.shop-content .product-grid article .product-copy {')
    expect(css.match(/\.shop-content \.product-grid article(?! \.product-copy)/g) ?? []).toHaveLength(0)
  })

  it('keeps degradation paths explicit', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)')
    expect(css).toContain('@media (forced-colors: active)')
    expect(css).not.toContain('codex-clipboard-48f9956f-6d8b-4299-b80c-3af550a184b8')
  })
})
