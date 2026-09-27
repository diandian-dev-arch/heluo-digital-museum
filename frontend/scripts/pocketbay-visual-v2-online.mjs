import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const out = '../artifacts/pocketbay-visual-v2-online'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    await page.goto('https://heluo.pocketbay.app/explore', { waitUntil: 'networkidle' })
    const app = page.frames().find(frame => frame.url().startsWith('https://heluo--e.pocketbay.app/')) ?? page
    await app.locator('.gallery-object').first().waitFor()
    for (const img of await app.locator('.gallery-object__media img').all()) {
      await img.scrollIntoViewIfNeeded()
      await img.evaluate(el => el.decode())
    }
    const state = await app.evaluate(() => {
      const boxes = [...document.querySelectorAll('.gallery-object__media')].map(el => {
        const r = el.getBoundingClientRect(), img = el.querySelector('img')
        return { x: r.x, y: r.y, width: r.width, height: r.height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, fit: getComputedStyle(img).objectFit }
      })
      return { boxes, overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(document.querySelector('.gallery-objects')).gridTemplateColumns.split(' ').length }
    })
    assert.equal(state.overflow, false)
    assert.equal(state.boxes.length, 6)
    assert.equal(state.columns, width > 1100 ? 3 : width <= 520 && locale === 'en-US' ? 1 : 2)
    for (const box of state.boxes) {
      assert(Math.abs(box.width - box.height) < 1)
      assert(box.naturalWidth > 0)
      assert.equal(box.fit, 'contain')
    }
    assert.deepEqual(errors, [])
    const ding = app.locator('.gallery-object[href="/artifacts/heluo-bronze-ding"]')
    assert((await ding.locator('img').evaluate(img => img.currentSrc)).includes('explore-bronze-ding-user-v2'))
    assert((await ding.textContent()).includes(locale === 'en-US' ? 'AI editorial image' : 'AI策展配图'))
    assert(state.boxes.every(box => box.naturalWidth === box.naturalHeight))
    await app.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `${out}/${width}-${theme}-${locale}.png`, fullPage: true })
    results.push({ width, theme, locale, ...state })
    await page.close()
  }
  await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ passed: true, states: results.length, out, sourceDimensions: results[0].boxes.map(b => [b.naturalWidth, b.naturalHeight]) }))
} finally { await browser.close() }
