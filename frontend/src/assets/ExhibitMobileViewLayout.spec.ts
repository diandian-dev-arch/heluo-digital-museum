import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/assets/route-exhibit-detail-legacy.css'), 'utf8')

describe('mobile exhibit view layout', () => {
  it('fits all five view thumbnails in common mobile widths', () => {
    expect(css).toMatch(/@media \(min-width: 391px\) and \(max-width: 760px\)[\s\S]*\.immersive-exhibit \.view-switcher > div\s*{[\s\S]*gap:\s*\.5rem;[\s\S]*padding-inline:\s*1px;[\s\S]*overflow-x:\s*hidden;/)
    expect(css).toMatch(/@media \(min-width: 391px\) and \(max-width: 760px\)[\s\S]*\.immersive-exhibit \.view-switcher button\s*{[\s\S]*flex:\s*1 1 0;[\s\S]*min-width:\s*0;[\s\S]*width:\s*auto;/)
  })

  it('keeps a minimum touch target and horizontal reach on narrow phones', () => {
    expect(css).toMatch(/@media \(max-width: 390px\)[\s\S]*\.immersive-exhibit \.view-switcher button\s*{[\s\S]*flex-basis:\s*68px;[\s\S]*width:\s*68px;/)
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.immersive-exhibit \.view-switcher > div\s*{[\s\S]*overflow-x:\s*auto;/)
  })
})
