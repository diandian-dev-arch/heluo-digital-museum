import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const out = '../artifacts/home-user-backgrounds-v2'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 932 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('heluo.theme', 'light'))
    await page.goto('http://127.0.0.1:4227/', { waitUntil: 'networkidle' })
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('.theme-toggle').click()
      await page.waitForFunction(theme => {
        const img = document.querySelector('.corridor-home__hero-media')
        return img?.complete && img.naturalWidth > 0 && img.currentSrc.includes(`home-corridor-${theme}-user-v2`)
      }, theme)
      const result = await page.evaluate(() => {
        const img = document.querySelector('.corridor-home__hero-media')
        return { src: img.currentSrc, width: img.naturalWidth, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      assert.equal(result.overflow, false)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: `${out}/${width}-${theme}.png` })
      results.push({ viewport: width, theme, ...result })
    }
    await page.close()
  }
  await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
