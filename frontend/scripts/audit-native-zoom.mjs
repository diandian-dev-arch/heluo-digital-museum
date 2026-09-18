import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:4189'
const output = '../artifacts/premium-visual-2026-09-12/native-zoom'
await mkdir(output, { recursive: true })
const signature = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const startSignature = await signature()
const env = JSON.parse(await readFile('../artifacts/sitewide-quality/current-environment.json', 'utf8'))
const response = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert(response.ok)
const token = (await response.json()).data.accessToken
const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const results = [], blockedWrites = []
try {
  const settings = context.pages()[0]
  await settings.goto('chrome://settings/appearance')
  await settings.locator('#zoomLevel').selectOption('2')
  assert.equal(await settings.locator('#zoomLevel').inputValue(), '2')
  await context.route('**/api/**', route => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    blockedWrites.push({ path: new URL(route.request().url()).pathname, method: route.request().method() })
    return route.abort('blockedbyclient')
  })
  for (const theme of ['light', 'dark']) for (const path of ['/', '/explore', '/appointment', '/shop', '/login', '/profile', '/admin', '/admin/operations']) {
    const page = await context.newPage()
    await page.addInitScript(({ theme, token, path }) => {
      if (location.hostname !== '127.0.0.1') return
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', 'en-US')
      if (path.startsWith('/admin') || path === '/profile') localStorage.setItem('heluo.access-token', token)
      else localStorage.removeItem('heluo.access-token')
    }, { theme, token, path })
    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').first().waitFor({ state: 'attached' })
    await page.waitForTimeout(500)
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, cssZoom: getComputedStyle(document.documentElement).zoom, overflow: document.documentElement.scrollWidth - innerWidth, route: location.pathname, heading: document.querySelector('h1')?.textContent.trim() }))
    assert.equal(metrics.width, 720)
    assert.equal(metrics.dpr, 2)
    assert.equal(metrics.cssZoom, '1')
    assert.equal(metrics.route, path)
    const focus = []
    for (const field of await page.locator('main input:not([type=hidden]), main button').all()) {
      if (!await field.isVisible() || !await field.isEnabled()) continue
      await field.focus()
      const check = await field.evaluate(el => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40) || el.getAttribute('placeholder'), focused: document.activeElement === el, top: r.top, bottom: r.bottom, height: innerHeight } })
      focus.push(check)
      if (focus.length >= 3) break
    }
    await page.screenshot({ path: `${output}/${path.replaceAll('/', '-') || 'home'}-${theme}.png` })
    results.push({ path, theme, ...metrics, focus })
    await page.close()
  }
} finally {
  const endSignature = await signature()
  await writeFile(`${output}/summary.json`, JSON.stringify({ complete: results.length === 16 && startSignature === endSignature, method: 'Chrome appearance settings #zoomLevel=2 in isolated temporary persistent profile; CSS zoom=1, actual viewport width720/DPR2 from baseline1440/DPR1. English representative routes, both themes; no business submissions. This is browser zoom, not CSS zoom or emulated device scale.', startSignature, endSignature, results, blockedWrites }, null, 2))
  await context.close()
}
console.log(JSON.stringify({ cases: results.length, overflow: results.filter(r => r.overflow > 0).map(r => ({ path: r.path, theme: r.theme, overflow: r.overflow })), blockedWrites: blockedWrites.length }))
