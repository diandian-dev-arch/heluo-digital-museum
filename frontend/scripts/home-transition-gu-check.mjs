import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const out = '../artifacts/home-transition-gu'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const width of [390, 412, 430, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const page = await browser.newPage({ viewport: { width, height: 932 }, reducedMotion: 'reduce' })
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    await page.goto('http://127.0.0.1:4220/', { waitUntil: 'networkidle' })
    const result = await page.evaluate(() => {
      const a = document.querySelector('.home-cover__actions')
      const button = a.querySelector('a').getBoundingClientRect()
      const cover = document.querySelector('.home-cover').getBoundingClientRect()
      return { paddingTop: getComputedStyle(a).paddingTop, buttonY: button.y, buttonBottom: button.bottom, coverBottom: cover.bottom, overflow: document.documentElement.scrollWidth > innerWidth, title: document.querySelector('h1').textContent }
    })
    assert.equal(result.overflow, false)
    assert.equal(result.paddingTop, width <= 760 ? '208px' : '0px')
    assert(result.buttonBottom < result.coverBottom)
    const figure = await page.locator('.home-closeup img').evaluate(img => ({ loaded: img.complete && img.naturalWidth > 0, height: img.getBoundingClientRect().height, src: img.currentSrc }))
    assert(figure.loaded && figure.src.includes('bronze-gu'))
    assert(figure.height <= (width <= 760 ? 320 : 400))
    const fade = await page.locator('.home-cover').evaluate(el => getComputedStyle(el, '::after').backgroundImage)
    assert(fade.includes('linear-gradient'))
    await page.screenshot({ fullPage: true, path: `${out}/${width}-${theme}-${locale}.png` })
    results.push({ width, theme, locale, ...result })
    await page.close()
  }
  await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
