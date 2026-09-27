import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseURL = process.env.MUSEUM_QA_URL || 'http://127.0.0.1:4193'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Fault injection requires a local verification server.')
const output = resolve(process.cwd(), '../artifacts/mobile-3d-runtime')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
const evidence = { baseURL, timestamp: new Date().toISOString(), physicalDevice: 'Not tested', scenarios: [], passed: false }
const exhibitPath = '/exhibits/heluo-bronze-ding-3d'

async function snapshot(page, scope, name) {
  const buffer = await scope.locator('.three-canvas canvas').screenshot({ path: resolve(output, `${name}-canvas.png`) })
  const pixels = await scope.evaluate(async encoded => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), character => character.charCodeAt(0))], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    const values = context.getImageData(0, 0, canvas.width, canvas.height).data
    const colors = new Set()
    let min = 255, max = 0
    for (let index = 0; index < values.length; index += 16) {
      colors.add(`${values[index] >> 3},${values[index + 1] >> 3},${values[index + 2] >> 3}`)
      const light = (values[index] + values[index + 1] + values[index + 2]) / 3
      min = Math.min(min, light)
      max = Math.max(max, light)
    }
    bitmap.close()
    return { width: canvas.width, height: canvas.height, colors: colors.size, luminanceRange: max - min }
  }, buffer.toString('base64'))
  assert.ok(pixels.colors > 20 && pixels.luminanceRange > 30, `${name}: blank canvas`)
  await page.screenshot({ path: resolve(output, `${name}-page.png`), fullPage: true })
  return { ...pixels, sha256: createHash('sha256').update(buffer).digest('hex') }
}

async function scenario({ name, width, theme, framed = false, persistent = false, blockStorage = false }) {
  const result = { name, width, theme, framed, persistent, blockStorage, requests: [], errors: [], navigations: [] }
  evidence.scenarios.push(result)
  const height = width < 760 ? 844 : 900
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 760, hasTouch: width < 760 })
  await context.addInitScript(({ theme, blockStorage }) => {
    localStorage.setItem('heluo.theme', theme)
    localStorage.setItem('heluo.locale', 'zh-CN')
    if (blockStorage) Object.defineProperty(window, 'sessionStorage', { get: () => { throw new DOMException('Storage blocked', 'SecurityError') } })
  }, { theme, blockStorage })
  const page = await context.newPage()
  page.on('pageerror', error => result.errors.push(error.message))
  page.on('request', request => { if (request.isNavigationRequest()) result.navigations.push(request.url()) })
  await context.route(/\/assets\/ThreeExhibitViewer-[^/]+\.js(?:\?.*)?$/, async route => {
    result.requests.push(route.request().url())
    if (persistent || result.requests.length === 1) await route.fulfill({ status: persistent ? 404 : 503, contentType: 'text/plain', body: 'Injected runtime outage' })
    else await route.continue()
  })
  try {
    if (framed) {
      await context.route(`${baseURL}/__runtime-audit-frame`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Embedded exhibit verification</title><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe name="museum" src="/exhibits"></iframe>' }))
      await page.goto(`${baseURL}/__runtime-audit-frame`, { waitUntil: 'domcontentloaded' })
      await expect.poll(() => page.frame({ name: 'museum' })?.url()).toBe(`${baseURL}/exhibits`)
    } else await page.goto(`${baseURL}/exhibits`, { waitUntil: 'domcontentloaded' })
    const scope = framed ? page.frame({ name: 'museum' }) : page
    assert.ok(scope, 'Exhibit frame is missing')
    await scope.locator(`a[href="${exhibitPath}"]`).first().click()
    const state = scope.locator('.exhibit-viewer-wrap')
    await state.waitFor()
    if (await state.getAttribute('data-viewer-state') === 'poster') await scope.locator('.viewer-poster-start').click()
    await expect(state).toHaveAttribute('data-viewer-state', 'error')
    await expect(scope.locator('.viewer-poster-copy')).toContainText('互动 3D 资源加载失败')
    assert.equal(result.requests.length, 1)
    assert.equal(await scope.locator('link[data-heluo-three-model-preload]').count(), 0)
    await page.screenshot({ path: resolve(output, `${name}-failure.png`), fullPage: true })
    const navigationsBeforeRetry = result.navigations.length
    await scope.locator('.viewer-poster-start').click()

    if (persistent) {
      await expect.poll(() => result.requests.length).toBe(2)
      await expect(state).toHaveAttribute('data-viewer-state', 'error')
      await page.waitForTimeout(1500)
      assert.equal(result.navigations.length, navigationsBeforeRetry + 1, 'Persistent failure caused a reload loop')
      assert.equal(result.requests.length, 2)
      await context.setOffline(true)
      await scope.locator('.viewer-poster-start').click()
      await expect(scope.locator('.viewer-poster-copy')).toContainText('网络已断开')
      assert.equal(result.navigations.length, navigationsBeforeRetry + 1, 'Offline retry should retain the current page')
      await scope.locator('.viewer-poster-info').click()
      await expect(scope.locator('[role="dialog"]')).toBeVisible()
      await scope.locator('[role="dialog"] button[aria-label="关闭面板"]').click()
      await context.setOffline(false)
      await page.screenshot({ path: resolve(output, `${name}-offline.png`), fullPage: true })
      await scope.locator('.viewer-poster-start').click()
      await expect.poll(() => result.requests.length).toBe(3)
      await expect(state).toHaveAttribute('data-viewer-state', 'error')
      assert.equal(result.navigations.length, navigationsBeforeRetry + 2)
      result.offlineDetailsAndNoReloadLoop = true
    } else {
      if (blockStorage) {
        await expect.poll(() => result.navigations.length).toBe(navigationsBeforeRetry + 1)
        await expect(state).toHaveAttribute('data-viewer-state', 'poster')
        await scope.locator('.viewer-poster-start').click()
      }
      await expect(scope.locator('.three-canvas[data-three-ready="true"]')).toBeVisible({ timeout: 90000 })
      assert.equal(result.requests.length, 2, 'Retry did not fetch the runtime again')
      assert.equal(result.navigations.length, navigationsBeforeRetry + 1)
      assert.equal(new URL(scope.url()).pathname, exhibitPath)
      if (framed) assert.equal(new URL(page.url()).pathname, '/__runtime-audit-frame', 'Recovery navigated the outer wrapper')
      result.solid = await snapshot(page, scope, `${name}-solid`)
      const host = scope.locator('.three-canvas')
      const submissionsBefore = Number(await host.getAttribute('data-render-submissions'))
      await scope.locator('.viewer-tools button').nth(0).click()
      await expect(host).toHaveAttribute('data-auto-rotate', 'true')
      await page.waitForTimeout(700)
      result.rotated = await snapshot(page, scope, `${name}-rotated`)
      assert.notEqual(result.rotated.sha256, result.solid.sha256, 'Rotation did not change the canvas')
      assert.ok(Number(await host.getAttribute('data-render-submissions')) > submissionsBefore)
      await scope.locator('.viewer-tools button').nth(1).click()
      await scope.locator('.viewer-tools button').nth(2).click()
      await scope.locator('.viewer-tools button').nth(3).click()
      await expect(host).toHaveAttribute('data-auto-rotate', 'false')
      await scope.locator('.view-switcher [data-view="top"]').click()
      await expect(scope.locator('.view-switcher [data-view="top"]')).toHaveAttribute('aria-pressed', 'true')
      if (width < 760) {
        await scope.locator('.mobile-exhibit-info-trigger').click()
        await expect(scope.locator('[role="dialog"]')).toBeVisible()
        await scope.locator('[role="dialog"] button[aria-label="关闭面板"]').click()
      }
      const points = scope.locator('.dock-mode-switch button').nth(1)
      await expect(points).toBeEnabled()
      await points.click()
      await expect(host).toHaveAttribute('data-point-cloud-state', 'ready', { timeout: 60000 })
      await page.waitForTimeout(2000)
      result.points = await snapshot(page, scope, `${name}-points`)
      await scope.locator('.dock-mode-switch button').first().click()
      await expect(scope.locator('.dock-mode-switch button').first()).toHaveAttribute('aria-pressed', 'true')
      result.restoredControls = true
    }
    result.geometry = await scope.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth, canvases: document.querySelectorAll('.three-canvas canvas').length }))
    assert.equal(result.geometry.width, width)
    assert.ok(result.geometry.scrollWidth <= result.geometry.viewportWidth, 'Page overflows horizontally')
    assert.deepEqual(result.errors, [])
    result.passed = true
    console.log(`${name}: passed (${result.requests.length} runtime requests)`)
  } catch (error) {
    result.failure = error.stack || error.message
    throw error
  } finally {
    await context.close()
  }
}

try {
  await scenario({ name: 'mobile-dark-iframe', width: 390, theme: 'dark', framed: true })
  await scenario({ name: 'desktop-light', width: 1440, theme: 'light' })
  await scenario({ name: 'mobile-persistent-offline', width: 390, theme: 'light', persistent: true })
  await scenario({ name: 'mobile-storage-blocked', width: 390, theme: 'light', framed: true, blockStorage: true })
  evidence.passed = true
} finally {
  await writeFile(resolve(output, 'recovery-results.json'), JSON.stringify(evidence, null, 2))
  await browser.close()
}
