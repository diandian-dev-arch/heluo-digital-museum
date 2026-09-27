import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(process.cwd(), '..', 'artifacts/sitewide-quality')
const output = resolve(process.env.HELUO_THREE_OUTPUT || resolve(root, 'three'))
const environment = JSON.parse(await readFile(resolve(root, 'current-environment.json'), 'utf8'))
const baseURL = process.env.MUSEUM_QA_URL || environment.baseURL
const exhibitsResponse = await fetch(`${baseURL}/api/v1/exhibits`)
assert.equal(exhibitsResponse.status, 200)
const exhibit = (await exhibitsResponse.json()).data[0]
assert.ok(exhibit?.slug)
const exhibitPath = `/exhibits/${exhibit.slug}`
await mkdir(output, { recursive: true })
const recoveryOnly = process.argv.includes('--recovery-only')

const summary = { timestamp: new Date().toISOString(), baseURL, exhibitPath, scope: recoveryOnly ? 'recovery-only' : 'full', network: 'Local environment, no network or CPU throttling. Mobile viewport emulation is not a physical phone.', metricDefinition: 'Render submissions count completed CPU calls to renderer.render/composer.render, not GPU completion or screen refresh rate.', pointLongTaskDefinition: 'Long tasks observed between clicking Points and readiness include construction, compilation, and concurrent main-thread work; they are not attributed exclusively to sampling.', realDeviceTenMinuteRun: 'not tested', states: [], recovery: {}, lifecycle: [], errors: [] }
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })

async function instrument(context, theme) {
  await context.addInitScript(({ theme }) => {
    localStorage.setItem('heluo.theme', theme)
    localStorage.setItem('heluo.locale', 'zh-CN')
    const originalAdd = EventTarget.prototype.addEventListener
    const originalRemove = EventTarget.prototype.removeEventListener
    const tracked = new WeakMap()
    const counts = new Map()
    let targetId = 0
    const identify = target => {
      if (target !== window && target !== document && !(target instanceof HTMLCanvasElement)) return null
      if (!tracked.has(target)) tracked.set(target, { id: ++targetId, name: target === window ? 'window' : target === document ? 'document' : 'canvas', listeners: new Map() })
      return tracked.get(target)
    }
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const target = identify(this)
      if (target && listener) {
        const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
        const key = `${type}:${capture}`
        const listeners = target.listeners.get(key) || new Set()
        listeners.add(listener)
        target.listeners.set(key, listeners)
        counts.set(`${target.name}:${target.id}:${key}`, listeners.size)
      }
      return originalAdd.call(this, type, listener, options)
    }
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const target = tracked.get(this)
      if (target) {
        const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
        const key = `${type}:${capture}`
        target.listeners.get(key)?.delete(listener)
        counts.set(`${target.name}:${target.id}:${key}`, target.listeners.get(key)?.size || 0)
      }
      return originalRemove.call(this, type, listener, options)
    }
    const longTasks = []
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true })
    window.__threeQualityAudit = {
      longTasks,
      listeners: () => [...counts].filter(([, count]) => count > 0).reduce((result, [name, count]) => { const key = name.replace(/:\d+:/, ':'); result[key] = (result[key] || 0) + count; return result }, {}),
    }
  }, { theme })
}

async function enter(page, fromGallery = false) {
  if (fromGallery) await page.locator(`a[href="${exhibitPath}"]`).first().click()
  else await page.goto(`${baseURL}${exhibitPath}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.exhibit-viewer-wrap').waitFor({ timeout: 45000 })
  const activation = page.locator('.viewer-poster-start')
  if (await activation.isVisible()) await activation.click()
  await page.locator('.three-canvas[data-three-ready="true"]').waitFor({ timeout: 90000 })
  assert.equal(await page.locator('.three-canvas canvas').count(), 1)
}

async function visibleButton(page, selector) {
  const elements = page.locator(selector)
  for (let index = 0; index < await elements.count(); index += 1) {
    const candidate = elements.nth(index)
    if (await candidate.isVisible()) return candidate
  }
  throw new Error(`No visible control: ${selector}`)
}

async function snapshot(page, name) {
  const canvas = page.locator('.three-canvas canvas')
  const buffer = await canvas.screenshot({ path: resolve(output, `${name}-canvas.png`) })
  const pixels = await page.evaluate(async encoded => {
    const image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), character => character.charCodeAt(0))], { type: 'image/png' }))
    const sample = document.createElement('canvas')
    sample.width = image.width
    sample.height = image.height
    const context = sample.getContext('2d')
    context.drawImage(image, 0, 0)
    const values = context.getImageData(0, 0, sample.width, sample.height).data
    const colors = new Set()
    let min = 255, max = 0
    for (let index = 0; index < values.length; index += 16) {
      colors.add(`${values[index] >> 3},${values[index + 1] >> 3},${values[index + 2] >> 3}`)
      const light = (values[index] + values[index + 1] + values[index + 2]) / 3
      min = Math.min(min, light)
      max = Math.max(max, light)
    }
    image.close()
    return { width: sample.width, height: sample.height, quantizedColors: colors.size, luminanceRange: max - min }
  }, buffer.toString('base64'))
  assert.ok(pixels.quantizedColors > 20 && pixels.luminanceRange > 30, `${name}: blank canvas`)
  await page.screenshot({ path: resolve(output, `${name}-page.png`), fullPage: true })
  return { ...pixels, sha256: createHash('sha256').update(buffer).digest('hex') }
}

async function submissions(page, duration = 1500) {
  const start = await page.locator('.three-canvas').evaluate(element => ({ count: Number(element.dataset.renderSubmissions), time: performance.now() }))
  await page.waitForTimeout(duration)
  return page.locator('.three-canvas').evaluate((element, start) => ({ count: Number(element.dataset.renderSubmissions) - start.count, durationMs: performance.now() - start.time, fps: (Number(element.dataset.renderSubmissions) - start.count) * 1000 / (performance.now() - start.time), quality: element.dataset.quality, renderState: element.dataset.renderState, drawCalls: Number(element.dataset.renderDrawCalls), geometries: Number(element.dataset.renderGeometries), textures: Number(element.dataset.renderTextures) }), start)
}

try {
  for (const width of recoveryOnly ? [] : [390, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390 })
    await instrument(context, theme)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const name = `${width}-${theme}`
    try {
      await enter(page)
      const runtime = await page.locator('.three-canvas canvas').evaluate(canvas => {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        const info = gl?.getExtension('WEBGL_debug_renderer_info')
        return { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency, deviceMemoryGiB: navigator.deviceMemory, devicePixelRatio: window.devicePixelRatio, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unavailable' }
      })
      const solidPixels = await snapshot(page, `${name}-solid`)
      const solidRendering = await submissions(page)
      assert.ok(solidRendering.count > 0 && solidRendering.drawCalls > 0)
      await page.locator('.viewer-tools button').nth(0).click()
      await page.waitForFunction(() => document.querySelector('.three-canvas')?.dataset.autoRotate === 'true')
      await page.waitForTimeout(350)
      const rotatedPixels = await snapshot(page, `${name}-rotated`)
      assert.notEqual(rotatedPixels.sha256, solidPixels.sha256, 'Rotate did not change canvas pixels')
      await page.locator('.viewer-tools button').nth(1).click()
      await page.locator('.viewer-tools button').nth(2).click()
      await page.locator('.viewer-tools button').nth(3).click()
      await page.waitForFunction(() => document.querySelector('.three-canvas')?.dataset.autoRotate === 'false')
      const pointControl = await visibleButton(page, '.mode-switch button:nth-child(2), .dock-mode-switch button:nth-child(2), button[aria-label="点云讲解"]')
      await page.evaluate(() => {
        const audit = window.__threeQualityAudit
        audit.pointClick = undefined
        document.addEventListener('click', () => { audit.pointClick = performance.now() }, { capture: true, once: true })
        const host = document.querySelector('.three-canvas')
        const observer = new MutationObserver(() => {
          if (host.dataset.pointCloudState === 'loading' && document.querySelector('button[aria-busy="true"]')) {
            audit.pointFeedback = performance.now()
            requestAnimationFrame(() => { audit.pointFeedbackFrame = performance.now() })
            observer.disconnect()
          }
        })
        observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-busy', 'data-point-cloud-state'] })
      })
      await pointControl.click()
      await page.locator('.three-canvas[data-point-cloud-state="ready"]').waitFor({ timeout: 60000 })
      const pointTiming = await page.evaluate(() => ({ feedbackMs: window.__threeQualityAudit.pointFeedback - window.__threeQualityAudit.pointClick, feedbackPaintOpportunityMs: window.__threeQualityAudit.pointFeedbackFrame - window.__threeQualityAudit.pointClick, elapsedMs: performance.now() - window.__threeQualityAudit.pointClick, longTasks: window.__threeQualityAudit.longTasks.filter(entry => entry.startTime >= window.__threeQualityAudit.pointClick) }))
      const phases = await page.locator('.three-canvas').evaluate(element => ({ samplingStart: Number(element.dataset.pointSamplingStartedAt), samplingEnd: Number(element.dataset.pointSamplingFinishedAt), compileStart: Number(element.dataset.pointCompileStartedAt), compileEnd: Number(element.dataset.pointCompileFinishedAt) }))
      pointTiming.phases = phases
      pointTiming.samplingOverlappingLongTasks = pointTiming.longTasks.filter(task => task.startTime < phases.samplingEnd && task.startTime + task.duration > phases.samplingStart)
      pointTiming.compilationOverlappingLongTasks = pointTiming.longTasks.filter(task => task.startTime < phases.compileEnd && task.startTime + task.duration > phases.compileStart)
      pointTiming.withinFeedbackTarget = Number.isFinite(pointTiming.feedbackPaintOpportunityMs) && Math.max(pointTiming.feedbackMs, pointTiming.feedbackPaintOpportunityMs) <= 100
      pointTiming.maxObservedLongTaskMs = Math.max(0, ...pointTiming.longTasks.map(entry => entry.duration))
      await page.waitForTimeout(1900)
      const pointPixels = await snapshot(page, `${name}-points`)
      const pointRendering = await submissions(page)
      pointTiming.renderPeak = await page.locator('.three-canvas').evaluate(element => ({ durationMs: Number(element.dataset.pointRenderPeakMs), start: Number(element.dataset.pointRenderPeakStartedAt), end: Number(element.dataset.pointRenderPeakFinishedAt) }))
      pointTiming.renderOverlappingLongTasks = await page.evaluate(peak => window.__threeQualityAudit.longTasks.filter(task => task.startTime < peak.end && task.startTime + task.duration > peak.start), pointTiming.renderPeak)
      const solidControl = await visibleButton(page, '.mode-switch button:first-child, .dock-mode-switch button:first-child')
      await solidControl.click()
      await page.waitForTimeout(900)
      assert.equal(await solidControl.getAttribute('aria-pressed'), 'true')
      summary.states.push({ name, width, theme, runtime, solidPixels, rotatedPixels, pointPixels, solidRendering, pointRendering, pointTiming, errors })
      console.log(`3D ${name}: feedback=${pointTiming.feedbackMs.toFixed(1)}ms; point submission FPS=${pointRendering.fps.toFixed(1)}`)
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${name}-failure.png`), fullPage: true }).catch(() => {})
      summary.errors.push({ name, message: error.message })
      console.error(`3D ${name}: ${error.message}`)
    } finally { await context.close() }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await instrument(context, 'light')
  const page = await context.newPage()
  const contextLimitWarnings = []
  page.on('console', message => { if (/too many active webgl contexts/i.test(message.text())) contextLimitWarnings.push(message.text()) })
  let rejectModels = true
  await page.route(/\.(glb|gltf)(\?|$)/, route => rejectModels ? route.abort('failed') : route.continue())
  await page.goto(`${baseURL}${exhibitPath}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.three-fallback[role="alert"]').waitFor({ timeout: 60000 })
  assert.equal(await page.locator('.three-canvas canvas').count(), 0)
  summary.recovery.modelFailure = { preservedCover: await page.locator('.three-fallback img').evaluate(image => image.complete && image.naturalWidth > 0), listeners: await page.evaluate(() => window.__threeQualityAudit.listeners()) }
  await page.waitForTimeout(900)
  await page.screenshot({ path: resolve(output, 'model-failure.png'), fullPage: true })
  rejectModels = false
  await page.locator('.three-fallback button').click()
  await page.locator('.three-canvas[data-three-ready="true"]').waitFor({ timeout: 90000 })
  summary.recovery.modelRetry = await snapshot(page, 'model-retry')
  const supported = await page.locator('.three-canvas canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_lose_context')
    extension?.loseContext()
    return Boolean(extension)
  })
  assert.ok(supported, 'WEBGL_lose_context unavailable')
  await page.locator('.three-fallback[role="alert"]').waitFor()
  assert.equal(await page.locator('.three-canvas canvas').count(), 0)
  await page.screenshot({ path: resolve(output, 'context-loss.png'), fullPage: true })
  await page.locator('.three-fallback button').click()
  await page.locator('.three-canvas[data-three-ready="true"]').waitFor({ timeout: 90000 })
  summary.recovery.contextLossRetry = await snapshot(page, 'context-loss-retry')

  const cancelPoints = await visibleButton(page, '.mode-switch button:nth-child(2), .dock-mode-switch button:nth-child(2)')
  await cancelPoints.click()
  await page.locator('.three-canvas[data-point-cloud-state="loading"]').waitFor()
  const returnSolid = await visibleButton(page, '.mode-switch button:first-child, .dock-mode-switch button:first-child')
  await returnSolid.click()
  await page.locator('.three-canvas[data-point-cloud-state="idle"]').waitFor()
  assert.equal(await returnSolid.getAttribute('aria-pressed'), 'true')
  await cancelPoints.click()
  await page.locator('.three-canvas[data-point-cloud-state="ready"]').waitFor({ timeout: 60000 })
  summary.recovery.pointSamplingCancelledAndRetried = true
  await returnSolid.click()

  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.dataset.threeAuditSpacer = 'true'
    spacer.style.height = '2000px'
    document.body.appendChild(spacer)
    window.scrollTo(0, document.body.scrollHeight)
  })
  await page.locator('.three-canvas[data-render-state="paused-offscreen"]').waitFor()
  const offscreen = await submissions(page, 250)
  assert.equal(offscreen.count, 0)
  await page.evaluate(() => { document.querySelector('[data-three-audit-spacer]')?.remove(); window.scrollTo(0, 0) })
  await page.locator('.three-canvas[data-render-state="running"]').waitFor()
  const onscreen = await submissions(page, 250)
  assert.ok(onscreen.count > 0)
  summary.recovery.offscreen = { method: 'Scroll beyond the canvas using a temporary test spacer, then remove the spacer and return.', paused: offscreen, resumed: onscreen }

  const otherPage = await context.newPage()
  await otherPage.bringToFront()
  const hidden = await page.evaluate(() => document.hidden)
  if (hidden) {
    const paused = await submissions(page, 250)
    assert.equal(paused.renderState, 'paused-hidden')
    assert.equal(paused.count, 0)
    await page.bringToFront()
    const resumed = await submissions(page, 250)
    assert.equal(resumed.renderState, 'running')
    assert.ok(resumed.count > 0)
    summary.recovery.background = { paused, resumed }
  } else summary.recovery.background = { status: 'not tested', reason: 'Headless browser did not hide the original page when another tab was activated.' }
  await otherPage.close()

  await page.locator('a[href="/exhibits"]').filter({ visible: true }).first().click()
  await page.waitForURL('**/exhibits')
  await page.locator(`a[href="${exhibitPath}"]`).first().waitFor()
  const baselineListeners = await page.evaluate(() => window.__threeQualityAudit.listeners())
  const baselineCanvasCount = await page.locator('canvas').count()
  let baselineRendererResources
  for (let cycle = 1; cycle <= 20; cycle += 1) {
    await enter(page, true)
    const host = await page.locator('.three-canvas').elementHandle()
    await page.waitForFunction(() => {
      const host = document.querySelector('.three-canvas')
      return Number(host?.dataset.renderGeometries) > 0 && Number(host?.dataset.renderTextures) > 0
    })
    const rendererResources = await host.evaluate(element => ({
      geometries: Number(element.dataset.renderGeometries), textures: Number(element.dataset.renderTextures),
    }))
    baselineRendererResources ??= rendererResources
    assert.deepEqual(rendererResources, baselineRendererResources, `Cycle ${cycle}: active renderer resource counts grew or changed for the same exhibit`)
    const before = await host.evaluate(element => ({ count: Number(element.dataset.renderSubmissions), state: element.dataset.renderState }))
    await page.locator('a[href="/exhibits"]').filter({ visible: true }).first().click()
    await page.waitForURL('**/exhibits')
    await page.locator(`a[href="${exhibitPath}"]`).first().waitFor()
    const stopped = await host.evaluate(element => ({ count: Number(element.dataset.renderSubmissions), state: element.dataset.renderState, connected: element.isConnected }))
    await page.waitForTimeout(120)
    const later = await host.evaluate(element => ({ count: Number(element.dataset.renderSubmissions), state: element.dataset.renderState }))
    const listeners = await page.evaluate(() => window.__threeQualityAudit.listeners())
    assert.equal(stopped.connected, false)
    assert.equal(later.state, 'stopped')
    assert.equal(later.count, stopped.count)
    assert.equal(await page.locator('.three-canvas canvas').count(), 0)
    const totalCanvasCountAfterExit = await page.locator('canvas').count()
    assert.equal(totalCanvasCountAfterExit, baselineCanvasCount)
    assert.deepEqual(listeners, baselineListeners, `Cycle ${cycle}: listener count changed`)
    summary.lifecycle.push({ cycle, before, stopped, later, rendererResources, listeners, threeCanvasCountAfterExit: 0, totalCanvasCountAfterExit })
    await host.dispose()
    console.log(`3D route cycle ${cycle}/20: stopped, canvas=0, listeners stable`)
  }
  let releaseModel
  const modelGate = new Promise(resolveGate => { releaseModel = resolveGate })
  await page.route(/\.(glb|gltf)(\?|$)/, async route => { await modelGate; await route.continue() })
  const modelRequested = page.waitForRequest(request => /\.(glb|gltf)(\?|$)/.test(request.url()), { timeout: 30000 })
  await page.locator(`a[href="${exhibitPath}"]`).first().click()
  await modelRequested
  await page.locator('.three-canvas canvas').waitFor()
  const interruptedHost = await page.locator('.three-canvas').elementHandle()
  await page.locator('a[href="/exhibits"]').filter({ visible: true }).first().click()
  await page.waitForURL('**/exhibits')
  await page.locator(`a[href="${exhibitPath}"]`).first().waitFor()
  const modelFinished = page.waitForEvent('requestfinished', { predicate: request => /\.(glb|gltf)(\?|$)/.test(request.url()), timeout: 60000 })
  releaseModel()
  await modelFinished
  await page.waitForTimeout(1000)
  const interrupted = await interruptedHost.evaluate(element => ({ connected: element.isConnected, state: element.dataset.renderState, submissions: Number(element.dataset.renderSubmissions) }))
  assert.equal(interrupted.connected, false)
  assert.equal(interrupted.state, 'stopped')
  assert.equal(await page.locator('.three-canvas canvas').count(), 0)
  assert.deepEqual(await page.evaluate(() => window.__threeQualityAudit.listeners()), baselineListeners)
  summary.recovery.exitDuringModelLoad = interrupted
  summary.recovery.contextLimitWarnings = contextLimitWarnings
  assert.equal(contextLimitWarnings.length, 0, 'WebGL contexts accumulated during route cycling')
  await interruptedHost.dispose()
  await context.close()
} catch (error) {
  summary.errors.push({ name: 'recovery-lifecycle', message: error.message })
  console.error(error)
} finally {
  await browser.close()
  await writeFile(resolve(output, recoveryOnly ? 'recovery-summary.json' : 'summary.json'), JSON.stringify(summary, null, 2))
}
if (summary.errors.length || summary.states.some(state => state.errors.length)) process.exitCode = 1
console.log(`3D audit: states=${summary.states.length}, cycles=${summary.lifecycle.length}, errors=${summary.errors.length}; ${resolve(output, recoveryOnly ? 'recovery-summary.json' : 'summary.json')}`)
