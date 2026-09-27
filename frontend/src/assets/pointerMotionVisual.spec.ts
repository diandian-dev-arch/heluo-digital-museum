/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/assets/pointer-motion.css'), 'utf8')
const pageCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')
const dotField = readFileSync(resolve(process.cwd(), 'src/components/PointerDotField.vue'), 'utf8')

describe('pointer motion visual prominence', () => {
  it('uses an immediate core and a restrained inertial halo', () => {
    expect(css).toContain('--cursor-dot-size: 4px;')
    expect(css).toContain('--cursor-halo-size: 30px;')
    expect(css).toContain('--cursor-halo-rim: color-mix(in oklch, var(--theme-action) 62%, transparent);')
    expect(css).toContain('--cursor-halo-glint: oklch(.78 .13 86 / .98);')
    expect(css).toContain('--cursor-dot-pressed-scale: .72;')
    expect(css).toContain('.pointer-cursor__halo')
    expect(css).toContain('data-pulling="true"')
    expect(css).toContain('--pointer-spotlight-radius: 240px;')
    expect(css).toContain('--pointer-spotlight-strength: .14;')
    expect(css).toContain('radial-gradient(circle 48px at var(--pointer-x) var(--pointer-y)')
    expect(css).toContain(':has(.pointer-dot-field[data-state="active"]) .pointer-cursor:not([data-intent="danger"])')
  })

  it('uses one geometric halo with a same-edge gold glint instead of a second ring', () => {
    expect(css).toContain('.pointer-cursor__halo::after')
    expect(css).toContain('conic-gradient(from 18deg')
    expect(css).not.toContain('box-shadow: 0 0 0 1px var(--cursor-halo-moonlight)')
  })

  it('keeps heading content clear and reserves the contrast field for image and paper surfaces', () => {
    expect(dotField).toContain('const contrastRadius = Math.min(radius * .7, 120)')
    expect(dotField).toContain("contrast.addColorStop(0, 'rgba(7, 54, 45, .075)')")
    expect(dotField).toContain('pointerInside && !dark && !heading')
    expect(dotField).not.toContain('hotGoldCore')
    expect(dotField).toContain('.pointer-dot-field[data-renderer="css"][data-palette="opaque"]')
    expect(pageCss).toContain('only the hovered route receives the gilded pointer edge')
  })

  it('suppresses motion modes while keeping the opaque field in reduced transparency', () => {
    expect(css).toContain('(prefers-reduced-motion: reduce)')
    expect(css).toContain('(prefers-contrast: more)')
    expect(css).toContain('(forced-colors: active)')
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
    const reducedTransparencyBlock = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)'))
    expect(reducedTransparencyBlock).not.toContain('.pointer-dot-field { display: none')
    expect(reducedTransparencyBlock).toContain('[data-pointer-surface]::before { display: none; }')
  })

  it('keeps the home route card on its established absolute layout', () => {
    expect(pageCss).toContain('.corridor-home__routes { position: absolute;')
    const dotFieldLayering = pageCss.slice(pageCss.indexOf('/* 2026-08-05 - Heluo pointer dot fields'))
    const routeRules = [...dotFieldLayering.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.split(',').some((selector) => selector.trim() === '.corridor-home__routes'))
    expect(routeRules.every(([, , declarations]) => !/position:\s*relative/.test(declarations))).toBe(true)
  })

  it('keeps Chinese home title lines clear of adjacent clipping bounds', () => {
    const titleRule = pageCss.match(/\.corridor-home__title-block h1\s*\{([^}]*)\}/)?.[1]
    const lineHeight = titleRule?.match(/font:[^;]*\/([\d.]+)\s/)?.[1]
    const lineRule = pageCss.match(/\.home-title-line\s*\{([^}]*)\}/)?.[1]

    expect(Number(lineHeight)).toBeGreaterThanOrEqual(1)
    expect(lineRule).toContain('overflow: hidden;')
    expect(lineRule).not.toMatch(/margin-block:\s*-/)
  })

  it('reserves enough mobile hero height for the title copy and route card', () => {
    expect(pageCss).toContain('.corridor-home__hero { min-height: 760px;')
  })
})
