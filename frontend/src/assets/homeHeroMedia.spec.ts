/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(resolve(root, 'src/assets/main.css'), 'utf8')
const mobileCss = readFileSync(resolve(root, 'src/assets/mobile-performance.css'), 'utf8')
const homeView = readFileSync(resolve(root, 'src/views/HomeView.vue'), 'utf8')

function readLossyWebpDimensions(file: string) {
  const bytes = readFileSync(file)
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP')
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('VP8 ')

  const startCode = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20)
  expect(startCode).toBeGreaterThan(-1)

  return {
    width: bytes.readUInt16LE(startCode + 3) & 0x3fff,
    height: bytes.readUInt16LE(startCode + 5) & 0x3fff,
  }
}

describe('home hero high-density media contract', () => {
  const mediaDir = resolve(root, 'public/media/editorial')
  const assets = [
    {
      name: 'light',
      oneX: 'museum-corridor-hero-hd-v2.webp',
      twoX: 'museum-corridor-hero-hd-v2@2x.webp',
      minWidth: 3000,
      minHeight: 1900,
    },
    {
      name: 'dark',
      oneX: 'museum-corridor-dark-image2-hd-v2.webp',
      twoX: 'museum-corridor-dark-image2-hd-v2@2x.webp',
      minWidth: 3300,
      minHeight: 1800,
    },
  ]

  it.each(assets)('ships a $name 2x WebP hero asset', ({ oneX, twoX, minWidth, minHeight }) => {
    const oneXPath = resolve(mediaDir, oneX)
    const twoXPath = resolve(mediaDir, twoX)
    expect(existsSync(oneXPath)).toBe(true)
    expect(existsSync(twoXPath)).toBe(true)

    const oneXSize = readLossyWebpDimensions(oneXPath)
    const twoXSize = readLossyWebpDimensions(twoXPath)
    expect(twoXSize.width).toBeGreaterThanOrEqual(minWidth)
    expect(twoXSize.height).toBeGreaterThanOrEqual(minHeight)
    expect(twoXSize.width).toBe(oneXSize.width * 2)
    expect(twoXSize.height).toBe(oneXSize.height * 2)
  })

  it('selects density-aware light and dark hero media without desktop over-scaling', () => {
    expect(homeView).toContain('home-corridor-light-user-v2.webp 1672w')
    expect(homeView).toContain('home-corridor-dark-user-v2.webp 1672w')
    expect(homeView).toContain('<source media="(max-width: 760px)"')
    expect(homeView).toContain('fetchpriority="high"')
    expect(mobileCss).toMatch(/\.corridor-home__hero-media\s*\{[^}]*object-fit:\s*cover/s)
    expect(css).not.toContain('museum-corridor-hero-hd-v2.webp\') 1x')
    expect(css).not.toContain('museum-corridor-dark-image2-hd-v2.webp\') 1x')
    expect(css).not.toMatch(/html\[data-theme="dark"\] \.corridor-home__hero\s*\{[^}]*background-size:\s*130% auto/s)
  })

  it('ships portrait mobile candidates and responsive card thumbnails', () => {
    for (const [file, width, height] of [
      ['home-corridor-light-user-v2-portrait.webp', 483, 941],
      ['home-corridor-dark-user-v2-portrait.webp', 483, 941],
    ] as const) {
      const dimensions = readLossyWebpDimensions(resolve(mediaDir, file))
      expect(dimensions).toEqual({ width, height })
      expect(homeView).toContain(file)
    }

    for (const file of [
      'hero-bronze-ding-home-192w-v1.webp',
      'hero-bronze-ding-home-384w-v1.webp',
      'hero-bronze-ding-home-640w-v1.webp',
      'heluo-river-map-home-192w-v1.webp',
      'heluo-river-map-home-384w-v1.webp',
      'heluo-river-map-home-640w-v1.webp',
    ]) expect(existsSync(resolve(mediaDir, file))).toBe(true)

    for (const file of [
      'jade-bi-home-192w-v1.webp',
      'jade-bi-home-384w-v1.webp',
      'jade-bi-home-640w-v1.webp',
    ]) expect(existsSync(resolve(root, 'public/media/exhibits', file))).toBe(true)

    expect(homeView).toContain('(max-width: 760px) 112px, (max-width: 1100px) 30vw, 380px')
  })
})
