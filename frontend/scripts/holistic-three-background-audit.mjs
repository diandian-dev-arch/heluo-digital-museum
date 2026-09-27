import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, mkdtemp, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

const baseURL = process.env.HELUO_BASE_URL || 'http://127.0.0.1:4196'
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const output = resolve('../artifacts/holistic', `three-background-${Date.now()}`)
await mkdir(output, { recursive: true })
const signature = async () => createHash('sha256').update(await (await fetch(baseURL)).text()).digest('hex')
const report = { baseURL, buildSignature: await signature(), complete: false, physicalDevice: false, results: [] }
// Separate owned browser outside the desktop viewport; tab visibility is native, not mocked.
const profile = await mkdtemp(resolve(tmpdir(), 'heluo-visibility-'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-position=-32000,-32000', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let port
for (let i = 0; i < 50; i++) { try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch {} await new Promise(r => setTimeout(r, 100)) }
assert.ok(port, 'Independent Chrome debug port unavailable')
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true })
report.method = 'Independent Chrome default context with noDefaults=true; native window minimization, no document.hidden mock'
report.temporaryProfile = profile
try {
  for (const width of [390, 1440]) {
    const context = browser.contexts()[0]
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 900 })
    // Playwright enables focus emulation; disable it so native tab visibility can change.
    const pageSession = await context.newCDPSession(page)
    await pageSession.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${baseURL}/exhibits`, { waitUntil: 'domcontentloaded' })
    await page.locator('a[href="/exhibits/heluo-bronze-ding-3d"]').first().click()
    const wrap = page.locator('.exhibit-viewer-wrap')
    await expect(wrap).toBeVisible()
    if (await wrap.getAttribute('data-viewer-state') === 'poster') await page.locator('.viewer-poster-start').click()
    const host = page.locator('.three-canvas')
    await expect(host).toHaveAttribute('data-three-ready', 'true', { timeout: 90000 })
    await page.locator('.viewer-tools button').first().click()
    await expect(host).toHaveAttribute('data-auto-rotate', 'true')
    const other = await context.newPage()
    const otherSession = await context.newCDPSession(other)
    await otherSession.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    const originalWindow = await pageSession.send('Browser.getWindowForTarget')
    const otherWindow = await otherSession.send('Browser.getWindowForTarget')
    report.windowIds = { original: originalWindow.windowId, other: otherWindow.windowId }
    await other.setContent('<title>Local visibility check</title><p>Independent tab visibility check</p>')
    for (const mode of ['solid', 'points']) {
      await page.bringToFront()
      if (mode === 'points') {
        await page.locator('.dock-mode-switch button').nth(1).click()
        await expect(host).toHaveAttribute('data-point-cloud-state', 'ready', { timeout: 60000 })
      }
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
      await other.bringToFront()
      await pageSession.send('Browser.setWindowBounds', { windowId: originalWindow.windowId, bounds: { windowState: 'minimized' } })
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden')
      await expect(host).toHaveAttribute('data-render-state', 'paused-hidden')
      const paused = Number(await host.getAttribute('data-render-submissions'))
      await other.waitForTimeout(1200)
      assert.equal(Number(await host.getAttribute('data-render-submissions')), paused, 'Hidden tab continued submitting renders')
      await pageSession.send('Browser.setWindowBounds', { windowId: originalWindow.windowId, bounds: { windowState: 'normal' } })
      await page.bringToFront()
      await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
      await expect.poll(async () => Number(await host.getAttribute('data-render-submissions'))).toBeGreaterThan(paused)
      await expect(host).toHaveAttribute('data-three-ready', 'true')
      assert.equal(await host.locator('canvas').count(), 1)
      await page.screenshot({ path: resolve(output, `${width}-${mode}-resumed.png`) })
      report.results.push({ width, mode, paused, resumed: Number(await host.getAttribute('data-render-submissions')), canvasCount: 1, errors: [...errors], passed: true })
      assert.deepEqual(errors, [])
    }
    await page.close()
    await other.close()
  }
  assert.equal(await signature(), report.buildSignature)
  report.complete = true
} finally {
  const session = await browser.newBrowserCDPSession()
  await session.send('Browser.close').catch(() => {})
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify({ output, complete: report.complete, states: report.results.length }))
