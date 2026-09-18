import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('mobile appointment and shop polish', () => {
  const taskPages = source('src/assets/task-pages.css')
  const publicResponsive = source('src/assets/public-responsive-polish.css')

  it('uses one compact editorial progress band instead of connected circles', () => {
    const mobile = taskPages.slice(taskPages.lastIndexOf('@media (max-width: 760px)'))
    expect(mobile).toMatch(/\.booking-steps\s*{[\s\S]*overflow:\s*hidden;[\s\S]*border-radius:\s*6px;[\s\S]*background:\s*color-mix\(in oklch, var\(--theme-primary-surface\) 92%, var\(--theme-surface-content\)\);/)
    expect(mobile).toMatch(/\.booking-steps::before\s*{\s*display:\s*none;/)
    expect(mobile).toMatch(/\.booking-steps li b\s*{[\s\S]*width:\s*auto;[\s\S]*height:\s*auto;[\s\S]*border:\s*0;/)
    expect(mobile).toMatch(/\.booking-steps li\.current::after\s*{[\s\S]*height:\s*2px;/)
  })

  it('rests on four complete date cards across mobile widths', () => {
    const mobile = taskPages.slice(taskPages.lastIndexOf('@media (max-width: 760px)'))
    expect(mobile).toMatch(/\.mobile-date-picker__rail\s*{[\s\S]*grid-auto-columns:\s*calc\(\(100% - 1\.5rem\) \/ 4\);[\s\S]*gap:\s*\.5rem;/)
    expect(mobile).toMatch(/\.mobile-date-picker__day\s*{[\s\S]*width:\s*100%;[\s\S]*scroll-snap-stop:\s*always;/)
  })

  it('turns the mobile store header into an unframed title band with four fixed tabs', () => {
    expect(publicResponsive).toMatch(/@media \(max-width: 760px\)[\s\S]*\.shop-content \.shop-intro\s*{[\s\S]*border:\s*0 !important;[\s\S]*border-bottom:\s*1px solid var\(--theme-border-strong\) !important;[\s\S]*background:\s*transparent !important;[\s\S]*box-shadow:\s*none !important;/)
    expect(publicResponsive).toMatch(/\.shop-content \.shop-intro \.pointer-dot-field\s*{\s*display:\s*none;/)
    expect(publicResponsive).toMatch(/\.shop-category-nav\s*{[\s\S]*display:\s*grid !important;[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*overflow:\s*hidden;/)
    expect(publicResponsive).toMatch(/\.shop-category-nav > button\s*{[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;/)
    expect(publicResponsive).toMatch(/html\[lang="en-US"\]\[data-theme\] #app \.shop-category-nav\s*{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/)
  })
})
