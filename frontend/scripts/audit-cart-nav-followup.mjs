import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:4189'
const output = '../artifacts/premium-visual-2026-09-12/cart-nav-after'
await mkdir(output, { recursive: true })
const signature = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const startSignature = await signature()
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [760, 761, 900, 901, 980, 981]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
    await page.addInitScript(({ theme }) => { localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', 'en-US') }, { theme })
    await page.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'))
    await page.goto(base + '/shop')
    await page.locator('.product-card').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => page.locator('.product-grid article').first().waitFor())
    const metrics = await page.evaluate(() => {
      const button = document.querySelector('.mobile-cart-trigger')
      const nav = document.querySelector('.mobile-tab-bar')
      const a = button.getBoundingClientRect(), b = nav.getBoundingClientRect()
      const visible = getComputedStyle(button).display !== 'none'
      const navVisible = getComputedStyle(nav).display !== 'none'
      const last = nav.querySelector('a:last-child'), r = last.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { visible, navVisible, overlap: visible && navVisible ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0, navHit: !navVisible || last === hit || last.contains(hit), buttonBottom: a.bottom, navTop: b.top, overflow: document.documentElement.scrollWidth - innerWidth }
    })
    assert.equal(metrics.overlap, 0)
    assert.equal(metrics.navHit, true)
    assert.equal(metrics.overflow, 0)
    if (metrics.visible) {
      await page.locator('.mobile-cart-trigger').click()
      await page.getByRole('dialog').waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      assert(await page.locator('.mobile-cart-trigger').evaluate(el => document.activeElement === el))
    }
    results.push({ width, theme, ...metrics, openClose: metrics.visible ? 'passed' : 'not-applicable-desktop-panel' })
    await page.screenshot({ path: `${output}/${width}-${theme}.png` })
    await page.close()
  }
} finally {
  const endSignature = await signature()
  await writeFile(`${output}/summary.json`, JSON.stringify({ complete: results.length === 12 && startSignature === endSignature, startSignature, endSignature, results }, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ passed: true, cases: results.length, output }))
