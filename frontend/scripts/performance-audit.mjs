import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASE_URL = process.env.HELUO_BASE_URL ?? 'http://localhost:8088'
const RUN_DURATION_MS = Number(process.env.HELUO_PERF_DURATION_MS ?? 10_000)
const OUTPUT_DIR = resolve(process.cwd(), '..', 'artifacts', 'performance')
const CHROME_PATH = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync)

if (!CHROME_PATH) throw new Error('未找到 Chrome。可通过 CHROME_PATH 指定可执行文件。')
if (!Number.isFinite(RUN_DURATION_MS) || RUN_DURATION_MS < 2_000) throw new Error('HELUO_PERF_DURATION_MS 必须至少为 2000。')

const routes = [
  { name: 'explore', path: '/explore', selector: '[data-pointer-surface]', pointCloud: false },
  { name: 'three', path: '/exhibits/heluo-bronze-ding-3d', selector: '.three-canvas', pointCloud: true },
]
const viewports = [
  [320, 800],
  [375, 812],
  [390, 844],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1672, 941],
]

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

class CdpClient {
  constructor(url) {
    this.url = url
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener('open', resolveOpen, { once: true })
      this.socket.addEventListener('error', rejectOpen, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
        else pending.resolve(message.result)
        return
      }
      this.listeners.get(message.method)?.forEach((listener) => listener(message.params))
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { method, resolve: resolveSend, reject: rejectSend })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  waitFor(method, timeoutMs = 30_000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const stop = this.on(method, (params) => {
        clearTimeout(timer)
        stop()
        resolveEvent(params)
      })
      const timer = setTimeout(() => {
        stop()
        rejectEvent(new Error(`等待 ${method} 超时`))
      }, timeoutMs)
    })
  }

  close() {
    this.socket?.close()
  }
}

function stats(values) {
  if (!values.length) return { count: 0, averageMs: 0, p95Ms: 0, maxMs: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const averageMs = values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    count: values.length,
    averageMs: Number(averageMs.toFixed(3)),
    p95Ms: Number(sorted[Math.min(Math.ceil(sorted.length * .95) - 1, sorted.length - 1)].toFixed(3)),
    maxMs: Number(sorted.at(-1).toFixed(3)),
  }
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch {}
    await sleep(100)
  }
  throw new Error(`Chrome 调试端口未就绪：${url}`)
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面脚本执行失败')
  return result.result.value
}

async function waitForPageReady(client, route) {
  const startedAt = Date.now()
  const deadline = startedAt + 45_000
  while (Date.now() < deadline) {
    const state = await evaluate(client, `(() => ({
      selector: Boolean(document.querySelector(${JSON.stringify(route.selector)})),
      loading: Boolean(document.querySelector('.three-overlay')),
      failed: Boolean(document.querySelector('.three-fallback')),
      renderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null
    }))()`)
    if (state.failed) throw new Error(`${route.name} 进入 3D 失败降级`)
    if (state.selector && !state.loading && (!route.pointCloud || state.renderState === 'running')) {
      return Date.now() - startedAt
    }
    await sleep(100)
  }
  throw new Error(`${route.name} 页面未在 45 秒内可交互`)
}

async function movePointer(client, bounds, durationMs) {
  const intervalMs = 25
  const steps = Math.max(Math.floor(durationMs / intervalMs), 1)
  for (let index = 0; index < steps; index += 1) {
    const progress = index / Math.max(steps - 1, 1)
    const x = bounds.left + bounds.width * (.12 + .76 * ((Math.sin(progress * Math.PI * 4) + 1) / 2))
    const y = bounds.top + bounds.height * (.18 + .64 * ((Math.cos(progress * Math.PI * 3) + 1) / 2))
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', pointerType: 'mouse' })
    await sleep(intervalMs)
  }
}

async function verifyLowFpsDowngrade(client, bounds) {
  await client.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-contrast', value: 'no-preference' },
      { name: 'forced-colors', value: 'none' },
    ],
  })
  await evaluate(client, `(() => {
    window.__heluoBurnFrames = true
    const burn = () => {
      if (!window.__heluoBurnFrames) return
      const started = performance.now()
      while (performance.now() - started < 30) {}
      requestAnimationFrame(burn)
    }
    requestAnimationFrame(burn)
  })()`)
  await movePointer(client, bounds, 2_200)
  await evaluate(client, `window.__heluoBurnFrames = false`)
  await sleep(100)
  return evaluate(client, `document.documentElement.dataset.motionTier ?? null`)
}

async function setMedia(client, values = {}) {
  await client.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [
      { name: 'prefers-reduced-motion', value: values.motion ?? 'no-preference' },
      { name: 'prefers-reduced-transparency', value: values.transparency ?? 'no-preference' },
      { name: 'prefers-contrast', value: values.contrast ?? 'no-preference' },
      { name: 'forced-colors', value: values.forcedColors ?? 'none' },
    ],
  })
  await sleep(120)
}

async function captureScreenshot(client, fileName) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(OUTPUT_DIR, fileName), Buffer.from(data, 'base64'))
  return fileName
}

async function readAccessibilityState(client) {
  return evaluate(client, `(() => {
    const surface = document.querySelector('[data-pointer-surface]')
    const controls = [...document.querySelectorAll('button, [role="tab"], nav a')]
    return {
      tier: document.documentElement.dataset.motionTier ?? null,
      cursorEnabled: document.documentElement.classList.contains('pointer-motion-enabled'),
      cursorCount: document.querySelectorAll('.pointer-cursor').length,
      media: {
        finePointer: matchMedia('(pointer: fine)').matches,
        hover: matchMedia('(hover: hover)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
        contrastMore: matchMedia('(prefers-contrast: more)').matches,
        forcedColors: matchMedia('(forced-colors: active)').matches,
      },
      surface: surface ? {
        transform: getComputedStyle(surface).transform,
        spotlightDisplay: getComputedStyle(surface, '::before').display,
      } : null,
      viewport: { width: innerWidth, height: innerHeight, scale: visualViewport?.scale ?? 1 },
      canvasCount: document.querySelectorAll('canvas').length,
      renderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedControls: controls.filter((control) => control.scrollWidth > control.clientWidth + 1).map((control) => (control.getAttribute('aria-label') || control.textContent || '').trim()).filter(Boolean).slice(0, 10),
    }
  })()`)
}

async function verifyAccessibilityModes(client, route) {
  const results = {}
  const modes = [
    ['reduced-motion', { motion: 'reduce' }],
    ['reduced-transparency', { transparency: 'reduce' }],
    ['high-contrast', { contrast: 'more' }],
    ['forced-colors', { forcedColors: 'active' }],
  ]
  for (const [name, values] of modes) {
    await setMedia(client, values)
    results[name] = await readAccessibilityState(client)
    results[name].screenshot = await captureScreenshot(client, `${route.name}-${name}.png`)
  }

  await setMedia(client)
  await client.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 450, deviceScaleFactor: 2, mobile: false })
  await sleep(150)
  results.zoom200 = await readAccessibilityState(client)
  results.zoom200.screenshot = await captureScreenshot(client, `${route.name}-zoom200.png`)
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  results.responsive = {}
  for (const [width, height] of viewports) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await sleep(150)
    const name = `${width}x${height}`
    results.responsive[name] = await readAccessibilityState(client)
    results.responsive[name].screenshot = await captureScreenshot(client, `${route.name}-${name}.png`)
  }

  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 120, y: 140, button: 'none', pointerType: 'pen' })
  await sleep(150)
  results.hybridPen = await readAccessibilityState(client)
  results.hybridPen.screenshot = await captureScreenshot(client, `${route.name}-hybrid-pen.png`)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 160, y: 180, button: 'none', pointerType: 'mouse' })
  await sleep(150)

  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(200)
  results.touch = await readAccessibilityState(client)
  results.touch.screenshot = await captureScreenshot(client, `${route.name}-touch-390x844.png`)
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  return results
}

async function verifyBackgroundPause(client, route, targetId) {
  await evaluate(client, `(() => {
    const audit = window.__heluoBackgroundAudit = { frames: 0, events: [], running: true }
    const sample = () => ({
      hidden: document.hidden,
      frames: audit.frames,
      time: performance.now(),
      tier: document.documentElement.dataset.motionTier ?? null,
      renderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null
    })
    const loop = () => {
      audit.frames += 1
      if (audit.running) requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', () => audit.events.push(sample()))
    requestAnimationFrame(loop)
  })()`)
  await sleep(200)

  const backgroundTarget = await client.send('Target.createTarget', { url: 'about:blank', background: false })
  try {
    await client.send('Target.activateTarget', { targetId: backgroundTarget.targetId })
    await sleep(5_000)
    await client.send('Target.activateTarget', { targetId })
    await sleep(200)
    return evaluate(client, `(() => {
      const audit = window.__heluoBackgroundAudit
      audit.running = false
      const hiddenIndex = audit.events.findIndex((event) => event.hidden)
      const hiddenEvent = hiddenIndex >= 0 ? audit.events[hiddenIndex] : null
      const visibleEvent = hiddenIndex >= 0 ? audit.events.slice(hiddenIndex + 1).find((event) => !event.hidden) ?? null : null
      return {
        hiddenObserved: Boolean(hiddenEvent && visibleEvent),
        hiddenDurationMs: hiddenEvent && visibleEvent ? Number((visibleEvent.time - hiddenEvent.time).toFixed(1)) : null,
        framesDuringHidden: hiddenEvent && visibleEvent ? visibleEvent.frames - hiddenEvent.frames : null,
        hiddenRenderState: hiddenEvent?.renderState ?? null,
        returnedTier: document.documentElement.dataset.motionTier ?? null,
        returnedRenderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null,
        routeRequiresRenderPause: ${route.pointCloud}
      }
    })()`)
  } finally {
    await client.send('Target.closeTarget', { targetId: backgroundTarget.targetId }).catch(() => {})
  }
}

function traceDurations(events, name, beforeTs, predicate = () => true) {
  return events
    .filter((event) => event.name === name && event.dur && predicate(event) && (beforeTs === undefined || event.ts < beforeTs))
    .map((event) => event.dur / 1000)
}

function traceDurationsAfter(events, name, afterTs, predicate = () => true) {
  return events
    .filter((event) => event.name === name && event.dur && predicate(event) && event.ts >= afterTs)
    .map((event) => event.dur / 1000)
}

async function runAudit(route, cpuRate) {
  const port = 9400 + Math.floor(Math.random() * 400)
  const profile = join(tmpdir(), `heluo-cdp-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' })

  let client
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`)
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
    const target = await targetResponse.json()
    client = new CdpClient(target.webSocketDebuggerUrl)
    await client.connect()

    const traceEvents = []
    const requests = new Map()
    const loadedBytes = new Map()
    client.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
    client.on('Network.requestWillBeSent', ({ requestId, request }) => requests.set(requestId, request.url))
    client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => loadedBytes.set(requestId, encodedDataLength))

    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
      client.send('Performance.enable'),
    ])
    await client.send('Network.setCacheDisabled', { cacheDisabled: true })
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'prefers-reduced-motion', value: 'no-preference' },
        { name: 'prefers-contrast', value: 'no-preference' },
        { name: 'forced-colors', value: 'none' },
      ],
    })

    const loaded = client.waitFor('Page.loadEventFired')
    await client.send('Page.navigate', { url: `${BASE_URL}${route.path}` })
    await loaded
    const interactiveAfterLoadMs = await waitForPageReady(client, route)
    const backgroundPause = cpuRate === 1 ? await verifyBackgroundPause(client, route, target.id) : null

    let pointCloudActivated = false
    if (route.pointCloud) {
      pointCloudActivated = await evaluate(client, `(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '点云')
        if (!button || button.disabled) return false
        button.click()
        return true
      })()`)
      await sleep(2_700)
    }

    const bounds = await evaluate(client, `(() => {
      const rect = document.querySelector(${JSON.stringify(route.selector)})?.getBoundingClientRect()
      return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
    })()`)
    if (!bounds) throw new Error(`${route.name} 未找到指针交互区域`)

    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
      button: 'none',
      pointerType: 'mouse',
    })
    await sleep(150)

    await client.send('Tracing.start', {
      categories: 'devtools.timeline,blink.user_timing,loading,v8,disabled-by-default-devtools.timeline',
      transferMode: 'ReportEvents',
    })
    await evaluate(client, `(() => {
      const audit = window.__heluoPerformanceAudit = { phase: 'full', frames: [], longTasks: [], startedAt: performance.now() }
      let previous
      const loop = (time) => {
        if (previous !== undefined) audit.frames.push({ phase: audit.phase, duration: time - previous })
        previous = time
        if (!audit.finished) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
      audit.tiers = [{ phase: audit.phase, tier: document.documentElement.dataset.motionTier ?? null, time: performance.now() }]
      document.documentElement.addEventListener('heluo:pointer-tier-change', (event) => {
        audit.tiers.push({ phase: audit.phase, tier: event.detail?.tier ?? null, time: performance.now() })
      })
      try {
        new PerformanceObserver((list) => list.getEntries().forEach((entry) => audit.longTasks.push({ phase: audit.phase, duration: entry.duration }))).observe({ type: 'longtask' })
      } catch {}
      performance.mark('heluo-full-start')
    })()`)

    const fullDuration = Math.floor(RUN_DURATION_MS / 2)
    await movePointer(client, bounds, fullDuration)
    const fullMotionState = await evaluate(client, `(() => ({
      tier: document.documentElement.dataset.motionTier ?? null,
      cursorEnabled: document.documentElement.classList.contains('pointer-motion-enabled')
    }))()`)
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-contrast', value: 'no-preference' },
        { name: 'forced-colors', value: 'none' },
      ],
    })
    await evaluate(client, `(() => {
      window.__heluoPerformanceAudit.phase = 'static'
      performance.mark('heluo-static-start')
    })()`)
    await sleep(150)
    await movePointer(client, bounds, RUN_DURATION_MS - fullDuration)
    await evaluate(client, `window.__heluoPerformanceAudit.finished = true`)

    const tracingComplete = client.waitFor('Tracing.tracingComplete')
    await client.send('Tracing.end')
    await tracingComplete

    const pageMetrics = await evaluate(client, `(() => {
      const audit = window.__heluoPerformanceAudit
      const resources = performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, startTime: entry.startTime, responseEnd: entry.responseEnd, transferSize: entry.transferSize }))
      const navigation = performance.getEntriesByType('navigation')[0]
      return {
        frames: audit.frames,
        longTasks: audit.longTasks,
        tiers: audit.tiers,
        tier: document.documentElement.dataset.motionTier,
        cursorEnabled: document.documentElement.classList.contains('pointer-motion-enabled'),
        renderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null,
        resources,
        navigation: navigation ? { domContentLoaded: navigation.domContentLoadedEventEnd, load: navigation.loadEventEnd } : null,
        media: {
          fine: matchMedia('(pointer: fine)').matches,
          hover: matchMedia('(hover: hover)').matches,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        },
      }
    })()`)

    const staticMarker = traceEvents.find((event) => event.name === 'heluo-static-start')
    const fallbackBoundary = traceEvents.length
      ? traceEvents[0].ts + (traceEvents.at(-1).ts - traceEvents[0].ts) / 2
      : 0
    const boundaryTs = staticMarker?.ts ?? fallbackBoundary
    const pointerEvent = (event) => event.args?.data?.type === 'pointermove' || event.args?.data?.type === 'mousemove'
    const fullPointer = stats(traceDurations(traceEvents, 'EventDispatch', boundaryTs, pointerEvent))
    const staticPointer = stats(traceDurationsAfter(traceEvents, 'EventDispatch', boundaryTs, pointerEvent))
    const fullRaf = stats(traceDurations(traceEvents, 'FireAnimationFrame', boundaryTs))
    const staticRaf = stats(traceDurationsAfter(traceEvents, 'FireAnimationFrame', boundaryTs))
    const fullFrameIntervals = stats(pageMetrics.frames.filter((frame) => frame.phase === 'full').map((frame) => frame.duration))
    const staticFrameIntervals = stats(pageMetrics.frames.filter((frame) => frame.phase === 'static').map((frame) => frame.duration))
    const resourceRows = [...requests.entries()].map(([requestId, url]) => ({ url, bytes: loadedBytes.get(requestId) ?? 0 }))
    const threeResources = resourceRows.filter((resource) => /three|OrbitControls|GLTFLoader|EffectComposer|RenderPass|UnrealBloom/i.test(resource.url))
    const modelResource = pageMetrics.resources.find((resource) => /\.glb(?:\?|$)/i.test(resource.name))
    const accessibility = cpuRate === 1
      ? await verifyAccessibilityModes(client, route)
      : null
    const lowFpsDowngradeTier = cpuRate === 4 && route.name === 'explore'
      ? await verifyLowFpsDowngrade(client, bounds)
      : null
    const traceFile = `${route.name}-cpu${cpuRate}x-trace.json.gz`
    await writeFile(join(OUTPUT_DIR, traceFile), gzipSync(JSON.stringify({ traceEvents })))

    return {
      route: route.path,
      cpuRate,
      durationMs: RUN_DURATION_MS,
      interactiveAfterLoadMs,
      navigation: pageMetrics.navigation,
      motion: {
        initialFinePointer: pageMetrics.media.fine,
        initialHover: pageMetrics.media.hover,
        fullTier: fullMotionState.tier,
        fullCursorEnabled: fullMotionState.cursorEnabled,
        finalReducedMotion: pageMetrics.media.reducedMotion,
        finalTier: pageMetrics.tier,
        finalCursorEnabled: pageMetrics.cursorEnabled,
        tierHistory: pageMetrics.tiers,
        lowFpsDowngradeTier,
      },
      pointCloudActivated,
      renderState: pageMetrics.renderState,
      pointerDispatch: { full: fullPointer, static: staticPointer },
      animationFrameCallback: {
        full: fullRaf,
        static: staticRaf,
        estimatedIncrementMs: Number(Math.max(fullRaf.averageMs - staticRaf.averageMs, 0).toFixed(3)),
      },
      frameIntervals: { full: fullFrameIntervals, static: staticFrameIntervals },
      longTasks: {
        full: stats(pageMetrics.longTasks.filter((task) => task.phase === 'full').map((task) => task.duration)),
        static: stats(pageMetrics.longTasks.filter((task) => task.phase === 'static').map((task) => task.duration)),
      },
      resources: {
        totalBytes: resourceRows.reduce((sum, resource) => sum + resource.bytes, 0),
        threeRequested: threeResources.length > 0,
        threeUrls: threeResources.map((resource) => resource.url),
        modelLoadMs: modelResource ? Number((modelResource.responseEnd - modelResource.startTime).toFixed(1)) : null,
      },
      backgroundPause,
      accessibility,
      traceFile,
    }
  } finally {
    client?.close()
    if (!chrome.killed) chrome.kill()
    if (basename(profile).startsWith('heluo-cdp-') && profile.startsWith(tmpdir())) {
      await rm(profile, { recursive: true, force: true }).catch(() => {})
    }
  }
}

await mkdir(OUTPUT_DIR, { recursive: true })
const results = []
for (const cpuRate of [1, 4]) {
  for (const route of routes) {
    process.stdout.write(`审计 ${route.name} / CPU ${cpuRate}x ... `)
    const result = await runAudit(route, cpuRate)
    results.push(result)
    process.stdout.write('完成\n')
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  chromePath: CHROME_PATH,
  runDurationMs: RUN_DURATION_MS,
  thresholds: {
    pointerDispatchAverageMs: .2,
    ordinaryRafAverageMs: 1,
    threeIncrementAverageMs: .5,
  },
  results,
}

const exploreNormal = results.find((result) => result.route === '/explore' && result.cpuRate === 1)
const threeNormal = results.find((result) => result.route.includes('/exhibits/') && result.cpuRate === 1)
const exploreThrottled = results.find((result) => result.route === '/explore' && result.cpuRate === 4)
const accessibilityModes = ['reduced-motion', 'high-contrast', 'forced-colors']
const accessibilityPasses = (result) => accessibilityModes.every((mode) => {
  const state = result?.accessibility?.[mode]
  return state?.tier === 'static' && state.cursorEnabled === false && state.cursorCount === 0 && state.horizontalOverflow === 0 && state.clippedControls.length === 0
})
const responsivePasses = (result) => viewports.every(([width, height]) => {
  const state = result?.accessibility?.responsive?.[`${width}x${height}`]
  return state?.horizontalOverflow === 0
    && state.clippedControls.length === 0
    && (!result.route.includes('/exhibits/') || state.canvasCount === 1 && state.renderState === 'running')
})

summary.gates = {
  ordinaryPointerBudget: Boolean(exploreNormal && exploreNormal.pointerDispatch.full.averageMs <= summary.thresholds.pointerDispatchAverageMs),
  ordinaryRafBudget: Boolean(exploreNormal && exploreNormal.animationFrameCallback.full.averageMs <= summary.thresholds.ordinaryRafAverageMs),
  ordinaryRouteExcludesThree: Boolean(exploreNormal && !exploreNormal.resources.threeRequested),
  threePointerBudget: Boolean(threeNormal && threeNormal.pointerDispatch.full.averageMs <= summary.thresholds.pointerDispatchAverageMs),
  threeIncrementBudget: Boolean(threeNormal && threeNormal.animationFrameCallback.estimatedIncrementMs <= summary.thresholds.threeIncrementAverageMs),
  pointCloudTraceActive: Boolean(threeNormal?.pointCloudActivated && threeNormal.renderState === 'running'),
  backgroundPauseStopsFrames: [exploreNormal, threeNormal].every((result) => {
    const pause = result?.backgroundPause
    return pause?.hiddenObserved
      && pause.hiddenDurationMs >= 4_500
      && pause.framesDuringHidden <= 1
      && pause.returnedTier === 'full'
      && (!pause.routeRequiresRenderPause || pause.hiddenRenderState === 'paused-hidden' && pause.returnedRenderState === 'running')
  }),
  cpu4LowFpsDowngradesToStatic: exploreThrottled?.motion.lowFpsDowngradeTier === 'static',
  reducedModesDisablePointer: accessibilityPasses(exploreNormal) && accessibilityPasses(threeNormal),
  reducedTransparencyRemovesSpotlight: exploreNormal?.accessibility?.['reduced-transparency']?.surface?.spotlightDisplay === 'none',
  zoom200HasNoCriticalOverflow: [exploreNormal, threeNormal].every((result) => {
    const zoom = result?.accessibility?.zoom200
    return zoom?.tier === 'static' && zoom.cursorEnabled === false && zoom.cursorCount === 0 && zoom.horizontalOverflow === 0 && zoom.clippedControls.length === 0
  }),
  fixedViewportsHaveNoCriticalOverflow: responsivePasses(exploreNormal) && responsivePasses(threeNormal),
  hybridPenUsesSystemPointer: [exploreNormal, threeNormal].every((result) => {
    const pen = result?.accessibility?.hybridPen
    return pen?.media?.finePointer === true
      && pen.media.hover === true
      && pen.tier === 'restrained'
      && pen.cursorEnabled === false
      && pen.cursorCount === 0
      && pen.horizontalOverflow === 0
      && pen.clippedControls.length === 0
  }),
  touchUsesSystemPointer: [exploreNormal, threeNormal].every((result) => {
    const touch = result?.accessibility?.touch
    return touch?.media?.finePointer === false
      && touch.media.hover === false
      && touch.tier === 'static'
      && touch.cursorEnabled === false
      && touch.cursorCount === 0
      && touch.horizontalOverflow === 0
      && touch.clippedControls.length === 0
  }),
}
summary.passed = Object.values(summary.gates).every(Boolean)

await writeFile(join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
if (!summary.passed) process.exitCode = 1
