/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

describe('public header bilingual brand', () => {
  it('uses complementary subtitles instead of repeating the English museum name', () => {
    expect(app).toContain("museum: '河洛数字博物馆', brandSubtitle: 'HELUO DIGITAL MUSEUM'")
    expect(app).toContain("museum: 'Heluo Digital Museum', brandSubtitle: '河洛数字博物馆'")
    expect(app).toContain('<small>{{ shellCopy.brandSubtitle }}</small>')
    expect(app).not.toContain('<small>HELUO DIGITAL MUSEUM</small>')
  })

  it('keeps visible air between the primary and secondary brand lines', () => {
    expect(css).toMatch(/\.brand-copy\s*\{[^}]*display:\s*grid;[^}]*gap:\s*\.34rem;/s)
    expect(css).toMatch(/\.brand-copy small\s*\{[^}]*font:\s*560 \.43rem\/1\.15 var\(--sans\)/s)
  })

  it('reserves three stable mobile utility slots and uses the account icon', () => {
    const mobile = css.slice(css.lastIndexOf('/* 2026-08-14 - mobile account access'))
    expect(mobile).toMatch(/\.site-header :is\(\.theme-toggle, \.locale-toggle, \.login-link\)\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-height:\s*44px;/)
    expect(mobile).toMatch(/\.site-header \.account-icon\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*18px;/)
    expect(mobile).toMatch(/\.site-header :is\(\.account-label--mobile, \.account-label--desktop\)[\s\S]*?display:\s*none;/)
    expect(mobile).toMatch(/\.site-header \.brand\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1 1 auto;/)
  })
})
