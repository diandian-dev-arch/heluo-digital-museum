import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/assets/task-pages.css'), 'utf8')

describe('desktop appointment visit card layout', () => {
  it('uses a compact fixed-height information band on desktop', () => {
    const desktop = css.slice(css.indexOf('@media (min-width: 761px)'))
    expect(desktop).toMatch(/\.booking-page \.visit-card\s*{[\s\S]*grid-template-columns:\s*minmax\(180px, 34%\) minmax\(0, 1fr\);[\s\S]*height:\s*154px;/)
    expect(desktop).toMatch(/\.booking-page \.visit-card > img\s*{[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*cover;/)
  })

  it('prevents the three Element Plus icons from stretching the card', () => {
    const desktop = css.slice(css.indexOf('@media (min-width: 761px)'))
    expect(desktop).toMatch(/\.visit-card :is\(p, footer\) svg\s*{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;[\s\S]*flex:\s*0 0 16px;/)
    expect(desktop).toMatch(/\.booking-page \.visit-card footer\s*{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/)
  })
})
