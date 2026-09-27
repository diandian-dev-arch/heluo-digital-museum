/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readView = (name: string) => readFileSync(resolve(process.cwd(), `src/views/${name}.vue`), 'utf8')

describe('pointer dot field page mapping', () => {
  it('mounts exactly once in each approved heading and nowhere in the 3D detail', () => {
    const mappings = [
      ['HomeView', /<section class="home-cover">[\s\S]*?<PointerDotField variant="image" \/>/],
      ['ExhibitsView', /<section class="exhibits-intro"[\s\S]*?<PointerDotField \/>/],
      ['AppointmentView', /<header class="appointment-heading"[\s\S]*?<PointerDotField variant="heading" \/>/],
    ] as const

    mappings.forEach(([view, pattern]) => {
      const source = readView(view)
      expect(source).toMatch(pattern)
      expect(source.match(/<PointerDotField\b/g)).toHaveLength(1)
    })
    expect(readView('ExhibitDetailView')).not.toContain('PointerDotField')
    expect(readView('ShopView')).not.toContain('PointerDotField')
    expect(readView('ExploreView')).not.toContain('PointerDotField')
  })

  it('retains the jade and gold identity without extra heat cores or outlines', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/PointerDotField.vue'), 'utf8')

    expect(source).toContain("'rgba(8, 117, 87, .4)'")
    expect(source).toContain("'rgba(255, 220, 56, 1)'")
    expect(source).toContain("'rgba(7, 124, 92, .34)'")
    expect(source).toContain("'rgba(255, 204, 20, .99)'")
    expect(source).not.toContain('hotGoldCore')
    expect(source).toContain('context!.shadowBlur = bronze ? 3 : 7')
    expect(source).not.toContain("activeJade: 'rgb(0 126 92)'")
    expect(source).toContain("context!.shadowColor = 'transparent'")
    expect(source).not.toContain('coreJade:')
    expect(source).not.toContain('lineWidth = bronze ? 3.2 : 2.4')
  })
})
