import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('ContentDetailView progressive reveal contract', () => {
  it('animates reading progress with a compositor transform instead of layout width', () => {
    const source = readFileSync('src/assets/main.css', 'utf8')

    expect(source).toContain('.reading-progress::before')
    expect(source).toContain('transform: scaleX(var(--progress, 0))')
    expect(source).toContain('transition: transform 160ms linear')
  })

  it('keeps scroll content visible until its trigger actually enters', () => {
    const source = readFileSync('src/views/ContentDetailView.vue', 'utf8')

    expect(source).not.toContain('gsap.set(paragraphs')
    expect(source).not.toContain('gsap.set(facts')
    expect(source).not.toContain('gsap.set(related')
    expect(source).toContain('onEnter: (elements) => gsap.fromTo(elements')
    expect(source).toContain("clearProps: 'opacity,visibility,transform'")
  })
})
