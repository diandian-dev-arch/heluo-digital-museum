import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('../artifacts/real-device', `three-diagnosis-${Date.now()}`)
await mkdir(output, { recursive: true })
const browser = await chromium.connectOverCDP('http://127.0.0.1:19222')
const events = []
try {
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http://127.0.0.1:4189/'))
  if (!page) throw new Error('Candidate museum tab is unavailable')
  if (process.argv.includes('--png-trial')) await page.route('**/heluo-bronze-ding-v5.5-mobile.glb', route => route.fulfill({ path: resolve('../artifacts/real-device/png-model-trial/model.glb'), contentType: 'model/gltf-binary' }))
  page.on('console', m => events.push({ type: m.type(), text: m.text() }))
  page.on('pageerror', e => events.push({ type: 'pageerror', text: e.message }))
  page.on('requestfailed', r => events.push({ type: 'requestfailed', url: r.url(), error: r.failure() }))
  await page.goto('http://127.0.0.1:4189/exhibits/heluo-bronze-ding-3d', { waitUntil: 'domcontentloaded' })
  if (process.argv.includes('--html-images')) await page.evaluate(() => { window.createImageBitmap = undefined })
  await page.evaluate(() => {
    window.__threeDiagnostic = []
    document.addEventListener('webglcontextlost', e => window.__threeDiagnostic.push({ type: e.type, status: e.statusMessage, at: performance.now() }), true)
    const original = WebGL2RenderingContext.prototype.getExtension
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      const extension = original.call(this, name)
      if (name === 'WEBGL_lose_context' && extension) {
        const lose = extension.loseContext.bind(extension)
        extension.loseContext = () => { window.__threeDiagnostic.push({ type: 'explicit-loss', stack: new Error().stack }); return lose() }
      }
      return extension
    }
  })
  await page.locator('.viewer-poster-start').click()
  try { await page.locator('[data-viewer-state="ready"], [data-viewer-state="error"]').waitFor({ timeout: 45000 }) }
  catch { events.push({ type: 'timeout', text: 'No terminal viewer state within 45 seconds' }) }
  if (await page.locator('[data-viewer-state="ready"]').count()) {
    await page.locator('.viewer-tools button').filter({ hasText: '旋转' }).click()
    await page.waitForTimeout(3000)
    await page.locator('.viewer-tools button').filter({ hasText: '放大' }).click()
    await page.waitForTimeout(1000)
  }
  const result = await page.evaluate(() => ({ state: document.querySelector('[data-viewer-state]')?.getAttribute('data-viewer-state'), canvas: document.querySelector('.three-canvas')?.dataset, visibility: document.visibilityState, diagnostic: window.__threeDiagnostic, resources: performance.getEntriesByType('resource').filter(r => /glb|texture|three/i.test(r.name)).map(r => ({ url: r.name, duration: r.duration, bytes: r.transferSize })) }))
  result.temporaryHtmlImageOverride = process.argv.includes('--html-images')
  result.temporaryPngModelOverride = process.argv.includes('--png-trial')
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ result, events }, null, 2))
  await page.screenshot({ path: resolve(output, 'terminal.png'), timeout: 10000 }).catch(e => events.push({ type: 'screenshot-error', text: e.message }))
  console.log(JSON.stringify({ output, result, events }, null, 2))
  if (process.argv.includes('--png-trial')) await page.unroute('**/heluo-bronze-ding-v5.5-mobile.glb')
} catch (error) {
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ error: String(error), temporaryPngModelOverride: process.argv.includes('--png-trial'), temporaryHtmlImageOverride: process.argv.includes('--html-images'), events }, null, 2))
  throw error
} finally { await browser.close() }
