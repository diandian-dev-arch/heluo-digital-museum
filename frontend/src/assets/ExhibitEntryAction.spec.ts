import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/assets/route-exhibit-detail-legacy.css'), 'utf8')

describe('desktop 3D entry action contract', () => {
  it('provides a stable mouse and keyboard target on constrained desktops', () => {
    expect(css).toMatch(/\.viewer-poster-actions\s*\{[^}]*width:\s*min\(100%, 260px\)/s)
    expect(css).toMatch(/\.viewer-poster-actions button\s*\{[^}]*width:\s*100%[^}]*min-height:\s*52px/s)
    expect(css).toMatch(/\.viewer-poster-actions button\s*\{[^}]*cursor:\s*pointer[^}]*pointer-events:\s*auto/s)
    expect(css).toContain('.immersive-exhibit .viewer-poster-actions button:focus-visible')
  })

  it('keeps non-interactive poster artwork outside the button hit test', () => {
    expect(css).toMatch(/\.three-fallback--activation > img\s*\{[^}]*pointer-events:\s*none/s)
  })
})
