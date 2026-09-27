import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const CLI_OPTIONS = parseCommandLine(process.argv.slice(2))
const BASE_URL = (CLI_OPTIONS.baseUrl ?? process.env.HELUO_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '')
const RUN_DURATION_MS = Number(process.env.HELUO_PERF_DURATION_MS ?? 10_000)
const MOBILE_AUTH_TOKEN = process.env.HELUO_PERF_AUTH_TOKEN?.trim() ?? ''
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

function parseCommandLine(args) {
  const options = { mode: 'pointer' }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--') continue
    if (argument === '--mobile') options.mode = 'mobile'
    else if (argument === '--mode' && args[index + 1]) options.mode = args[++index]
    else if (argument.startsWith('--mode=')) options.mode = argument.slice('--mode='.length)
    else if (argument === '--base-url' && args[index + 1]) options.baseUrl = args[++index]
    else if (argument.startsWith('--base-url=')) options.baseUrl = argument.slice('--base-url='.length)
    else if (argument === '--network' && args[index + 1]) options.network = args[++index].toLowerCase()
    else if (argument.startsWith('--network=')) options.network = argument.slice('--network='.length).toLowerCase()
    else if (argument === '--routes' && args[index + 1]) options.routes = args[++index].split(',').map((value) => value.trim()).filter(Boolean)
    else if (argument.startsWith('--routes=')) options.routes = argument.slice('--routes='.length).split(',').map((value) => value.trim()).filter(Boolean)
    else throw new Error(`未知参数：${argument}`)
  }
  if (!['pointer', 'mobile'].includes(options.mode)) throw new Error(`不支持的审计模式：${options.mode}`)
  if (options.network && !['all', 'fast4g', 'slow4g'].includes(options.network)) {
    throw new Error('--network 仅支持 all、fast4g 或 slow4g')
  }
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--base-url 必须使用 http 或 https')
  }
  return options
}

const routes = [
  { name: 'explore', path: '/explore', selector: '.collection-page #collection-title', dotSelector: '.collection-discovery', pointCloud: false },
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
  let activationAttempted = false
  while (Date.now() < deadline) {
    const state = await evaluate(client, `(() => ({
      selector: Boolean(document.querySelector(${JSON.stringify(route.selector)})),
      loading: Boolean(document.querySelector('.three-overlay')),
      failed: Boolean(document.querySelector('.three-fallback[role="alert"]')),
      canActivate: [...document.querySelectorAll('.three-fallback[role="status"] button')].some((button) => !button.disabled),
      renderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null
    }))()`)
    if (state.failed) throw new Error(`${route.name} 进入 3D 失败降级`)
    if (route.pointCloud && state.canActivate && !activationAttempted) {
      activationAttempted = true
      await evaluate(client, `document.querySelector('.three-fallback[role="status"] button')?.click()`)
      await sleep(100)
      continue
    }
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
  // The runtime requires two critical FPS windows before entering static.
  // Exercise the throttled page long enough to observe both windows.
  await movePointer(client, bounds, 3_200)
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
    const dotField = document.querySelector('[data-pointer-dot-field]')
    const controls = [...document.querySelectorAll('button, [role="tab"], nav a')]
    return {
      tier: document.documentElement.dataset.motionTier ?? null,
      cursorEnabled: document.documentElement.classList.contains('pointer-motion-enabled'),
      cursorCount: document.querySelectorAll('.pointer-cursor').length,
      dotField: dotField ? {
        state: dotField.getAttribute('data-state'),
        palette: dotField.getAttribute('data-palette'),
        display: getComputedStyle(dotField).display,
        pointerEvents: getComputedStyle(dotField).pointerEvents,
      } : null,
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
        { name: 'prefers-reduced-transparency', value: 'no-preference' },
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

    const dotBounds = route.dotSelector ? await evaluate(client, `(() => {
      const rect = document.querySelector(${JSON.stringify(route.dotSelector)})?.getBoundingClientRect()
      return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null
    })()`) : null
    let dotFieldActivated = false
    if (dotBounds) {
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: dotBounds.left + dotBounds.width / 2,
        y: dotBounds.top + dotBounds.height / 2,
        button: 'none',
        pointerType: 'mouse',
      })
      await sleep(150)
      dotFieldActivated = await evaluate(client, `document.querySelector('[data-pointer-dot-field]')?.getAttribute('data-state') === 'active'`)
    }

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
    if (dotBounds) await movePointer(client, dotBounds, Math.floor(fullDuration / 2))
    await movePointer(client, bounds, dotBounds ? Math.ceil(fullDuration / 2) : fullDuration)
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
        dotFieldActivated,
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

const mobileRoutes = [
  { name: '首页', path: '/', selector: '.corridor-home' },
  { name: '探索', path: '/explore', selector: '.collection-page' },
  { name: '预约', path: '/appointment', selector: '.booking-page' },
  { name: '商城', path: '/shop', selector: '#shop-products' },
  { name: '登录', path: '/login', selector: '.auth-page' },
  { name: '个人中心', path: '/profile', selector: '.auth-page', requiresAuth: true },
  { name: '3D 展项', path: '/exhibits/heluo-bronze-ding-3d', selector: '.immersive-exhibit', three: true },
]

const mobileNetworkProfiles = {
  fast4g: {
    label: 'Fast 4G',
    latencyMs: 150,
    downloadBytesPerSecond: 4_000_000 / 8,
    uploadBytesPerSecond: 1_000_000 / 8,
    cpuRate: 4,
    blocking: true,
  },
  slow4g: {
    label: 'Slow 4G',
    latencyMs: 300,
    downloadBytesPerSecond: 1_600_000 / 8,
    uploadBytesPerSecond: 750_000 / 8,
    cpuRate: 4,
    blocking: false,
  },
}

function mobileObserverSource() {
  return String.raw`(() => {
    const firstFrameMarkName = 'heluo-three-first-frame-ready'
    const audit = window.__heluoMobileAudit = {
      paints: {}, lcp: null, cls: 0, eventTimings: [], longTasks: [],
      three: { startAt: null, firstFrameAt: null, firstFrameMarkName }
    }
    const observe = (type, callback, options = {}) => {
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(callback))
        observer.observe({ type, buffered: true, ...options })
      } catch {}
    }
    observe('paint', (entry) => { audit.paints[entry.name] = entry.startTime })
    observe('largest-contentful-paint', (entry) => {
      audit.lcp = { startTime: entry.startTime, size: entry.size }
    })
    observe('layout-shift', (entry) => {
      if (!entry.hadRecentInput) audit.cls += entry.value
    })
    observe('event', (entry) => {
      if (!entry.interactionId) return
      audit.eventTimings.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId })
    }, { durationThreshold: 16 })
    observe('longtask', (entry) => {
      const attribution = Array.isArray(entry.attribution)
        ? entry.attribution.map((item) => {
          let containerSrc = null
          try { containerSrc = item.containerSrc ? new URL(item.containerSrc, location.href).pathname : null } catch {}
          return {
            containerType: item.containerType ?? null,
            containerName: item.containerName ?? null,
            containerId: item.containerId ?? null,
            containerSrc,
          }
        })
        : []
      audit.longTasks.push({ startTime: entry.startTime, duration: entry.duration, attribution })
    })
    const recordThreeFirstFrame = () => {
      const mark = performance.getEntriesByName(firstFrameMarkName, 'mark').at(-1)
      if (mark) audit.three.firstFrameAt = mark.startTime
    }
    observe('mark', (entry) => {
      if (entry.name === firstFrameMarkName) audit.three.firstFrameAt = entry.startTime
    })
    addEventListener('heluo:three-first-frame-ready', recordThreeFirstFrame)
    recordThreeFirstFrame()
  })()`
}

function mobileAuthBootstrapSource() {
  const baseOrigin = new URL(BASE_URL).origin
  return `(() => {
    if (location.origin !== ${JSON.stringify(baseOrigin)}) return
    try { localStorage.setItem('heluo.access-token', ${JSON.stringify(MOBILE_AUTH_TOKEN)}) } catch {}
  })()`
}

function createMobileCollector() {
  return {
    requests: new Map(),
    inflight: new Set(),
    lastActivityAt: Date.now(),
  }
}

function lowerCaseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]))
}

function safeCacheHeaders(headers = {}) {
  const normalized = lowerCaseHeaders(headers)
  return Object.fromEntries([
    'cache-control', 'age', 'etag', 'last-modified', 'cf-cache-status',
    'content-range', 'accept-ranges', 'content-type', 'vary',
  ].filter((name) => normalized[name] !== undefined).map((name) => [name, normalized[name]]))
}

function sanitizedUrl(value) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return '<invalid-url>'
  }
}

function resourceCategory(resource) {
  const url = resource.url.toLowerCase()
  const mime = (resource.mimeType ?? '').toLowerCase()
  const path = url.split(/[?#]/, 1)[0]
  if (resource.type === 'Document') return 'html'
  if (resource.type === 'Script' || /(?:java|ecma)script/.test(mime) || /\.m?js$/.test(path)) return 'js'
  if (resource.type === 'Font' || /^font\//.test(mime) || /application\/(?:font|x-font|vnd\.ms-fontobject)/.test(mime) || /\.(?:woff2?|ttf|otf)$/.test(path)) return 'font'
  if (resource.type === 'Stylesheet' || /css/.test(`${mime} ${url}`)) return 'css'
  if (resource.type === 'Image' || /image|\.webp$|\.png$|\.jpe?g$|\.avif$|\.svg$/.test(`${mime} ${url}`)) return 'image'
  if (/model|gltf|glb|octet-stream/.test(`${mime} ${url}`) && /\.glb$|\.gltf$|model/.test(`${mime} ${url}`)) return 'model'
  if (resource.type === 'Fetch' || resource.type === 'XHR' || /\/api\//.test(url)) return 'api'
  return 'other'
}

function mobileResourceRows(collector) {
  return [...collector.requests.values()]
    .filter((resource) => resource.url && !/^(?:data|blob):/.test(resource.url))
    .map((resource) => {
      const fromBrowserCache = resource.servedFromCache || resource.response?.fromDiskCache || resource.response?.fromPrefetchCache
      const cacheSource = resource.response?.fromServiceWorker
        ? 'service-worker'
        : resource.response?.fromDiskCache
          ? 'disk-cache'
          : resource.response?.fromPrefetchCache
            ? 'prefetch-cache'
            : fromBrowserCache
              ? 'browser-cache'
              : 'network'
      const row = {
        url: sanitizedUrl(resource.url),
        type: resource.type ?? 'Other',
        mimeType: resource.response?.mimeType ?? null,
        status: resource.response?.status ?? null,
        transferBytes: Math.max(0, Math.round(resource.encodedDataLength ?? 0)),
        cacheSource,
        cacheHeaders: safeCacheHeaders(resource.response?.headers),
      }
      row.category = resourceCategory(row)
      return row
    })
}

function summarizeMobileResources(rows) {
  const categories = ['html', 'css', 'js', 'font', 'image', 'model', 'api', 'other']
  const byCategory = Object.fromEntries(categories.map((category) => [category, {
    requests: 0, transferBytes: 0, cachedRequests: 0,
  }]))
  for (const row of rows) {
    const summary = byCategory[row.category] ?? byCategory.other
    summary.requests += 1
    summary.transferBytes += row.transferBytes
    if (row.cacheSource !== 'network') summary.cachedRequests += 1
  }
  return {
    requests: rows.length,
    transferBytes: rows.reduce((sum, row) => sum + row.transferBytes, 0),
    cachedRequests: rows.filter((row) => row.cacheSource !== 'network').length,
    byCategory,
  }
}

async function waitForMobileRoute(client, route) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const ready = await evaluate(client, `(() => document.readyState === 'complete'
      && Boolean(document.querySelector(${JSON.stringify(route.selector)})))()`)
    if (ready) return
    await sleep(100)
  }
  throw new Error(`${route.name} 未在 45 秒内完成页面壳加载`)
}

async function waitForMobileNetworkIdle(collector, timeoutMs = 12_000, quietMs = 750) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (collector.inflight.size === 0 && Date.now() - collector.lastActivityAt >= quietMs) return true
    await sleep(100)
  }
  return false
}

async function measureMobileFps(client, durationMs = 5_000) {
  return evaluate(client, `new Promise((resolve) => {
    const durationMs = ${durationMs}
    const startedAt = performance.now()
    const frames = []
    const sample = (time) => {
      frames.push(time)
      if (time - startedAt < durationMs) return requestAnimationFrame(sample)
      const intervals = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b)
      const medianInterval = intervals.length ? intervals[Math.floor(intervals.length / 2)] : null
      const buckets = []
      for (let offset = 0; offset < durationMs; offset += 1000) {
        const bucketEnd = Math.min(startedAt + offset + 1000, startedAt + durationMs)
        const seconds = (bucketEnd - (startedAt + offset)) / 1000
        const rendered = frames.slice(1).filter((time) => time > startedAt + offset && time <= bucketEnd).length
        buckets.push(Number((rendered / seconds).toFixed(1)))
      }
      let longestConsecutiveBelow30Seconds = 0
      let consecutiveBelow30Seconds = 0
      for (const fps of buckets) {
        consecutiveBelow30Seconds = fps < 30 ? consecutiveBelow30Seconds + 1 : 0
        longestConsecutiveBelow30Seconds = Math.max(longestConsecutiveBelow30Seconds, consecutiveBelow30Seconds)
      }
      resolve({
        durationMs,
        frameCount: frames.length,
        medianFps: medianInterval ? Number((1000 / medianInterval).toFixed(1)) : null,
        minimumOneSecondFps: buckets.length ? Math.min(...buckets) : null,
        oneSecondFps: buckets,
        longestConsecutiveBelow30Seconds,
      })
    }
    requestAnimationFrame(sample)
  })`, true)
}

async function readMobileThreeReady(client) {
  return evaluate(client, `(() => {
    const mark = performance.getEntriesByName('heluo-three-first-frame-ready', 'mark').at(-1)
    return {
      ready: document.querySelector('.three-canvas')?.getAttribute('data-three-ready') === 'true',
      markAt: mark?.startTime ?? null,
      running: document.querySelector('.three-canvas')?.getAttribute('data-render-state') === 'running',
    }
  })()`)
}

async function triggerMobileThreeRotation(client) {
  const result = await evaluate(client, `(() => {
    const iconButton = document.querySelector('.tool-rotate')?.closest('button')
    const labelledButton = [...document.querySelectorAll('button')].find((button) =>
      /旋转|rotate/i.test((button.getAttribute('aria-label') || button.textContent || '').trim()))
    const button = iconButton || labelledButton
    if (!button) return { buttonFound: false, enabled: false, clicked: false }
    if (button.disabled) return { buttonFound: true, enabled: false, clicked: false }
    button.click()
    return { buttonFound: true, enabled: true, clicked: true }
  })()`)
  await sleep(100)
  return {
    ...result,
    active: await evaluate(client, `document.querySelector('.three-canvas')?.getAttribute('data-auto-rotate') === 'true'`),
  }
}

async function stopMobileThreeRotation(client) {
  await evaluate(client, `(() => {
    if (document.querySelector('.three-canvas')?.getAttribute('data-auto-rotate') !== 'true') return
    const button = document.querySelector('.tool-rotate')?.closest('button')
    if (button && !button.disabled) button.click()
  })()`)
}

async function measureRotatingMobileThree(client) {
  const rotation = await triggerMobileThreeRotation(client)
  if (!rotation.active) return { rotation, fps: null }
  try {
    return { rotation, fps: await measureMobileFps(client, 5_000) }
  } finally {
    await stopMobileThreeRotation(client)
  }
}

async function startMobileThree(client) {
  const state = await readMobileThreeReady(client)
  if (state.ready && state.markAt !== null) {
    const measured = state.running
      ? await measureRotatingMobileThree(client)
      : { rotation: null, fps: null }
    return {
      attempted: false, autoStarted: true, buttonFound: false,
      ready: true, readyMarkObserved: true, running: state.running,
      rotation: measured.rotation, fps: measured.fps,
    }
  }

  const clicked = await evaluate(client, `(() => {
    const explicit = document.querySelector('[data-three-start], .three-start-button, .exhibit-viewer-poster button, .three-poster button')
    const textButton = [...document.querySelectorAll('button')].find((button) =>
      /启动|开启|进入.*3D|加载.*3D|start|launch/i.test((button.textContent || '').trim()))
    const button = explicit || textButton
    if (!button || button.disabled) return false
    window.__heluoMobileAudit.three.startAt = performance.now()
    button.click()
    return true
  })()`)
  if (!clicked) return {
    attempted: false, autoStarted: false, buttonFound: false,
    ready: false, readyMarkObserved: false, running: false, rotation: null, fps: null,
  }

  const deadline = Date.now() + 45_000
  let readyState = { ready: false, markAt: null, running: false }
  while (Date.now() < deadline) {
    readyState = await readMobileThreeReady(client)
    if (readyState.ready && readyState.markAt !== null && readyState.running) break
    await sleep(100)
  }
  const measured = readyState.ready && readyState.markAt !== null && readyState.running
    ? await measureRotatingMobileThree(client)
    : { rotation: null, fps: null }
  return {
    attempted: true,
    autoStarted: false,
    buttonFound: true,
    ready: readyState.ready,
    readyMarkObserved: readyState.markAt !== null,
    running: readyState.running,
    rotation: measured.rotation,
    fps: measured.fps,
  }
}

async function probeModelRange(client, rawModelUrl) {
  if (!rawModelUrl) return null
  return evaluate(client, `fetch(${JSON.stringify(rawModelUrl)}, {
    method: 'GET', headers: { Range: 'bytes=0-1023' }, cache: 'no-store'
  }).then(async (response) => {
    const bytes = (await response.arrayBuffer()).byteLength
    return {
      status: response.status,
      bytes,
      contentRange: response.headers.get('content-range'),
      acceptRanges: response.headers.get('accept-ranges'),
      cacheControl: response.headers.get('cache-control'),
      cfCacheStatus: response.headers.get('cf-cache-status')
    }
  }).catch((error) => ({ error: error?.name || 'RangeProbeError' }))`, true)
}

async function runMobileVisit(client, route, cacheState, collector) {
  const loaded = client.waitFor('Page.loadEventFired', 60_000)
  await client.send('Page.navigate', { url: `${BASE_URL}${route.path}` })
  await loaded
  await waitForMobileRoute(client, route)
  const networkIdle = await waitForMobileNetworkIdle(collector)
  await sleep(500)

  const preStartRows = mobileResourceRows(collector)
  const preStartResources = summarizeMobileResources(preStartRows)
  const three = route.three ? await startMobileThree(client) : null
  if (route.three && (three?.attempted || three?.autoStarted)) await waitForMobileNetworkIdle(collector, 45_000)

  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(500)

  const pageMetrics = await evaluate(client, `(() => {
    const audit = window.__heluoMobileAudit
    const navigation = performance.getEntriesByType('navigation')[0]
    const visibleBlurDetails = [...document.querySelectorAll('body *')].filter((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const filter = style.backdropFilter || style.webkitBackdropFilter || 'none'
      return filter !== 'none' && style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
    }).map((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className.slice(0, 160) : null,
        dataGlass: element.getAttribute('data-glass'),
        filter: style.backdropFilter || style.webkitBackdropFilter || 'none',
        rect: {
          left: Math.round(rect.left), top: Math.round(rect.top),
          width: Math.round(rect.width), height: Math.round(rect.height),
        },
      }
    })
    const interactions = new Map()
    for (const entry of audit.eventTimings) {
      interactions.set(entry.interactionId, Math.max(interactions.get(entry.interactionId) || 0, entry.duration))
    }
    const interactionDurations = [...interactions.values()].sort((a, b) => b - a)
    return {
      finalPath: location.pathname,
      navigation: navigation ? {
        ttfb: navigation.responseStart - navigation.requestStart,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        load: navigation.loadEventEnd,
      } : null,
      fcp: audit.paints['first-contentful-paint'] ?? null,
      lcp: audit.lcp?.startTime ?? null,
      lcpSize: audit.lcp?.size ?? null,
      cls: audit.cls,
      inp: interactionDurations[0] ?? null,
      interactionCount: interactionDurations.length,
      longTasks: audit.longTasks,
      visibleBlurElements: visibleBlurDetails.length,
      visibleBlurDetails,
      threeTiming: {
        startAt: audit.three.startAt,
        firstFrameAt: audit.three.firstFrameAt,
        clickToFirstFrameMs: audit.three.startAt !== null && audit.three.firstFrameAt !== null
          ? audit.three.firstFrameAt - audit.three.startAt
          : null
      }
    }
  })()`)

  const rows = mobileResourceRows(collector)
  const resources = summarizeMobileResources(rows)
  const reportedPreStartResources = route.three && three?.autoStarted ? resources : preStartResources
  const modelRows = rows.filter((row) => row.category === 'model')
  const modelRawUrl = [...collector.requests.values()].find((resource) => /\.glb(?:[?#]|$)/i.test(resource.url))?.url
  const range = route.three ? await probeModelRange(client, modelRawUrl) : null
  const longTaskDurations = pageMetrics.longTasks.map((task) => task.duration)
  const routeReached = pageMetrics.finalPath === route.path
  const measurementStatus = routeReached
    ? 'measured'
    : route.requiresAuth
      ? 'not-measured-auth-required'
      : 'route-mismatch'

  return {
    route: route.path,
    routeName: route.name,
    finalPath: pageMetrics.finalPath,
    routeReached,
    measurementStatus,
    cacheState,
    networkIdle,
    metrics: {
      ...pageMetrics.navigation,
      fcp: pageMetrics.fcp,
      lcp: pageMetrics.lcp,
      lcpSize: pageMetrics.lcpSize,
      cls: Number(pageMetrics.cls.toFixed(4)),
      inp: pageMetrics.inp,
      interactionCount: pageMetrics.interactionCount,
      longTasks: {
        count: longTaskDurations.length,
        totalMs: Number(longTaskDurations.reduce((sum, duration) => sum + duration, 0).toFixed(1)),
        maxMs: longTaskDurations.length ? Number(Math.max(...longTaskDurations).toFixed(1)) : 0,
        details: pageMetrics.longTasks,
      },
      visibleBlurElements: pageMetrics.visibleBlurElements,
      visibleBlurDetails: pageMetrics.visibleBlurDetails,
    },
    resources,
    preStartResources: route.three ? reportedPreStartResources : null,
    three: route.three ? {
      ...three,
      ...pageMetrics.threeTiming,
      addedTransferBytes: Math.max(0, resources.transferBytes - reportedPreStartResources.transferBytes),
      modelTransferBytes: modelRows.reduce((sum, row) => sum + row.transferBytes, 0),
      range,
    } : null,
    resourceDetails: rows,
  }
}

async function runMobileRoutePair(route, networkKey, network) {
  const port = 9800 + Math.floor(Math.random() * 500)
  const profile = join(tmpdir(), `heluo-mobile-cdp-${Date.now()}-${Math.random().toString(16).slice(2)}`)
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
    '--window-size=390,844',
    'about:blank',
  ], { stdio: 'ignore' })

  let client
  let activeCollector
  const traceEvents = []
  let traceComplete
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`)
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
    const target = await targetResponse.json()
    client = new CdpClient(target.webSocketDebuggerUrl)
    await client.connect()
    client.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
      client.send('Performance.enable'),
    ])

    client.on('Network.requestWillBeSent', ({ requestId, request, type }) => {
      if (!activeCollector) return
      activeCollector.lastActivityAt = Date.now()
      activeCollector.inflight.add(requestId)
      activeCollector.requests.set(requestId, { requestId, url: request.url, type })
    })
    client.on('Network.requestServedFromCache', ({ requestId }) => {
      const resource = activeCollector?.requests.get(requestId)
      if (resource) resource.servedFromCache = true
    })
    client.on('Network.responseReceived', ({ requestId, response, type }) => {
      const resource = activeCollector?.requests.get(requestId)
      if (!resource) return
      resource.type = type ?? resource.type
      resource.response = response
    })
    client.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      if (!activeCollector) return
      const resource = activeCollector.requests.get(requestId)
      if (resource) resource.encodedDataLength = encodedDataLength
      activeCollector.inflight.delete(requestId)
      activeCollector.lastActivityAt = Date.now()
    })
    client.on('Network.loadingFailed', ({ requestId }) => {
      if (!activeCollector) return
      activeCollector.inflight.delete(requestId)
      activeCollector.lastActivityAt = Date.now()
    })

    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: mobileObserverSource() })
    if (MOBILE_AUTH_TOKEN) {
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source: mobileAuthBootstrapSource() })
    }
    await client.send('Emulation.setCPUThrottlingRate', { rate: network.cpuRate })
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: network.latencyMs,
      downloadThroughput: network.downloadBytesPerSecond,
      uploadThroughput: network.uploadBytesPerSecond,
      connectionType: 'cellular4g',
    })
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await client.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      platform: 'Android',
    })
    await client.send('Network.setCacheDisabled', { cacheDisabled: false })
    await client.send('Network.clearBrowserCache')

    if (process.env.HELUO_PERF_TRACE_MOBILE === '1') {
      traceComplete = client.waitFor('Tracing.tracingComplete', 60_000)
      await client.send('Tracing.start', {
        categories: 'devtools.timeline,blink.user_timing,loading,v8,disabled-by-default-devtools.timeline',
        transferMode: 'ReportEvents',
      })
    }

    activeCollector = createMobileCollector()
    const cold = await runMobileVisit(client, route, 'cold', activeCollector)
    activeCollector = createMobileCollector()
    const warm = await runMobileVisit(client, route, 'warm', activeCollector)
    activeCollector = null
    let traceFile = null
    if (traceComplete) {
      await client.send('Tracing.end')
      await traceComplete
      const routeSlug = route.path === '/' ? 'home' : route.path.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/g, '')
      traceFile = `${routeSlug}-${networkKey}-mobile-trace.json.gz`
      await writeFile(join(OUTPUT_DIR, traceFile), gzipSync(JSON.stringify({ traceEvents })))
    }
    return { network: networkKey, networkLabel: network.label, cold, warm, traceFile }
  } finally {
    activeCollector = null
    client?.close()
    if (!chrome.killed) chrome.kill()
    if (basename(profile).startsWith('heluo-mobile-cdp-') && profile.startsWith(tmpdir())) {
      await rm(profile, { recursive: true, force: true }).catch(() => {})
    }
  }
}

function mobileThresholds() {
  const hostname = new URL(BASE_URL).hostname
  const local = ['localhost', '127.0.0.1', '::1'].includes(hostname)
  return {
    environment: local ? 'local' : 'remote',
    ttfbMs: local ? 500 : 800,
    fcpMs: local ? 1_800 : 2_500,
    lcpMs: local ? 2_500 : 3_500,
    cls: 0.1,
    inpMs: local ? 200 : 250,
    longTaskMaxMsExclusive: 200,
    homeColdTransferBytes: 1024 * 1024,
    homeWarmTransferBytes: 150 * 1024,
    homeRequestCount: 20,
    homeFontRequestCount: 6,
    homeFontTransferBytes: 300 * 1024,
    homeCssTransferBytes: 80 * 1024,
    homeJsTransferBytes: 180 * 1024,
    homeImageTransferBytes: 350 * 1024,
    visibleBlurElements: 2,
    threePreStartBytes: Math.round(1.2 * 1024 * 1024),
    threeAddedBytes: 3 * 1024 * 1024,
    mobileModelBytes: Math.round(1.5 * 1024 * 1024),
    threeFirstFrameMs: 4_000,
    threeFpsDurationMs: 5_000,
    threeMedianFps: 45,
    threeMinimumOneSecondFps: 30,
  }
}

function resourcePath(resource) {
  try { return new URL(resource.url).pathname }
  catch { return '' }
}

function cacheControlHas(resource, ...directives) {
  const cacheControl = (resource.cacheHeaders?.['cache-control'] ?? '').toLowerCase()
  return directives.every((directive) => cacheControl.includes(directive))
}

function isVersionedMediaPath(path) {
  return /(?:[-_.]v[0-9]+(?:[.-][0-9]+)*(?:[-_.][a-z0-9]+)*|@[0-9]+x)\.[a-z0-9]+$/i.test(path)
}

function cacheGate(resources, predicate, policy) {
  const matches = resources.filter(predicate)
  return matches.length > 0 && matches.every(policy)
}

function calculateMobileGates(pairs, thresholds) {
  const fastPairs = pairs.filter((pair) => pair.network === 'fast4g')
  const fastVisits = fastPairs.flatMap((pair) => [pair.cold, pair.warm])
  const fastCold = fastPairs.map((pair) => pair.cold)
  const measuredFastCold = fastCold.filter((result) => result.measurementStatus === 'measured')
  const home = fastCold.find((result) => result.route === '/')
  const homeWarm = fastPairs.find((pair) => pair.cold.route === '/')?.warm
  const three = fastCold.find((result) => result.three)
  const ordinary = measuredFastCold.filter((result) => !result.three)
  // Header checks remain valid for an unauthenticated protected-route redirect because
  // they inspect only the response metadata, never the redirected page's performance.
  const cacheResources = fastCold.flatMap((result) => result.resourceDetails)
  const expectedMeasuredRoutes = fastPairs.length
  const allMetric = (metric, predicate) => measuredFastCold.length === expectedMeasuredRoutes
    && measuredFastCold.every((result) => predicate(result.metrics[metric]))
  const range = three?.three?.range
  const fps = three?.three?.fps
  const gates = {
    requestedRoutesReached: fastVisits.every((result) => result.routeReached),
    fast4gTtfb: allMetric('ttfb', (value) => Number.isFinite(value) && value <= thresholds.ttfbMs),
    fast4gFcp: allMetric('fcp', (value) => Number.isFinite(value) && value <= thresholds.fcpMs),
    fast4gLcp: allMetric('lcp', (value) => Number.isFinite(value) && value <= thresholds.lcpMs),
    fast4gCls: allMetric('cls', (value) => Number.isFinite(value) && value <= thresholds.cls),
    fast4gLongTasks: ordinary.length === fastPairs.filter((pair) => !pair.cold.three).length
      && ordinary.every((result) => result.metrics.longTasks.maxMs < thresholds.longTaskMaxMsExclusive),
    homeColdTransferBudget: Boolean(home?.routeReached
      && home.resources.transferBytes <= thresholds.homeColdTransferBytes),
    homeWarmTransferBudget: Boolean(homeWarm?.routeReached
      && homeWarm.resources.transferBytes <= thresholds.homeWarmTransferBytes),
    homeRequestBudget: Boolean(home?.routeReached
      && home.resources.requests <= thresholds.homeRequestCount),
    homeFontRequestBudget: Boolean(home?.routeReached
      && home.resources.byCategory.font.requests <= thresholds.homeFontRequestCount),
    homeFontTransferBudget: Boolean(home?.routeReached
      && home.resources.byCategory.font.transferBytes <= thresholds.homeFontTransferBytes),
    homeCssTransferBudget: Boolean(home?.routeReached
      && home.resources.byCategory.css.transferBytes <= thresholds.homeCssTransferBytes),
    homeJsTransferBudget: Boolean(home?.routeReached
      && home.resources.byCategory.js.transferBytes <= thresholds.homeJsTransferBytes),
    homeImageTransferBudget: Boolean(home?.routeReached
      && home.resources.byCategory.image.transferBytes <= thresholds.homeImageTransferBytes),
    visibleBlurBudget: measuredFastCold.length === expectedMeasuredRoutes
      && measuredFastCold.every((result) => result.metrics.visibleBlurElements <= thresholds.visibleBlurElements),
    htmlRevalidationHeaders: cacheGate(
      cacheResources,
      (resource) => resource.category === 'html',
      (resource) => cacheControlHas(resource, 'no-cache', 'must-revalidate'),
    ),
    immutableAssetHeaders: cacheGate(
      cacheResources,
      (resource) => resourcePath(resource).startsWith('/assets/'),
      (resource) => cacheControlHas(resource, 'public', 'max-age=31536000', 'immutable'),
    ),
    mediaCacheHeaders: cacheGate(
      cacheResources,
      (resource) => resourcePath(resource).startsWith('/media/'),
      (resource) => isVersionedMediaPath(resourcePath(resource))
        ? cacheControlHas(resource, 'public', 'max-age=31536000', 'immutable')
        : cacheControlHas(resource, 'public', 'max-age=86400') && !cacheControlHas(resource, 'immutable'),
    ),
    apiNoStoreHeaders: cacheGate(
      cacheResources,
      (resource) => resource.category === 'api' || resourcePath(resource).startsWith('/api/'),
      (resource) => cacheControlHas(resource, 'no-store'),
    ),
    ordinaryRoutesExcludeThree: ordinary.every((result) => result.resourceDetails.every((resource) =>
      resource.category !== 'model' && !/three|gltfloader|orbitcontrols/i.test(resource.url))),
    threeRequiresExplicitStart: Boolean(three?.three?.attempted && !three.three.autoStarted),
    threePreStartBudget: Boolean(three?.routeReached
      && three.preStartResources.transferBytes <= thresholds.threePreStartBytes),
    threeAddedTransferBudget: Boolean(three?.three && three.three.addedTransferBytes <= thresholds.threeAddedBytes),
    mobileModelBudget: Boolean(three?.three && three.three.modelTransferBytes > 0 && three.three.modelTransferBytes <= thresholds.mobileModelBytes),
    threeReadyMarkObserved: Boolean(three?.three?.ready && three.three.readyMarkObserved),
    threeRenderLoopRunning: three?.three?.running === true,
    threeFirstFrameBudget: Boolean(three?.three?.readyMarkObserved && Number.isFinite(three.three.clickToFirstFrameMs)
      && three.three.clickToFirstFrameMs <= thresholds.threeFirstFrameMs),
    threeRotationTriggered: Boolean(three?.three?.rotation?.active),
    threeMedianFpsBudget: Boolean(fps && fps.durationMs >= thresholds.threeFpsDurationMs
      && Number.isFinite(fps.medianFps) && fps.medianFps >= thresholds.threeMedianFps),
    threeFiveSecondFpsFloor: Boolean(fps && fps.durationMs >= thresholds.threeFpsDurationMs
      && fps.oneSecondFps?.length >= thresholds.threeFpsDurationMs / 1000
      && Number.isFinite(fps.minimumOneSecondFps)
      && fps.minimumOneSecondFps >= thresholds.threeMinimumOneSecondFps),
    modelRangeRequest: Boolean(range?.status === 206
      && range.bytes === 1024
      && /^bytes 0-1023\/\d+$/i.test(range.contentRange ?? '')),
  }
  if (!home) for (const key of Object.keys(gates).filter(key => key.startsWith('home'))) delete gates[key]
  if (!three) for (const key of Object.keys(gates).filter(key => /^(three|mobileModel|modelRange)/.test(key))) delete gates[key]
  return gates
}

const formatMs = (value) => Number.isFinite(value) ? `${Math.round(value)} ms` : '未采集'
const formatBytes = (value) => Number.isFinite(value) ? `${(value / 1024).toFixed(1)} KiB` : '未采集'

function renderMobileMarkdown(summary) {
  const lines = [
    '# 河洛数字博物馆移动性能审计',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- 目标：${summary.baseUrl}`,
    '- 设备模拟：390x844、DPR 3、Android coarse pointer、CPU 4x',
    '- 隐私：未读取或保存响应正文；资源 URL 已移除查询参数和片段。',
    '- INP 为自动化键盘交互观察值，不代替真实手机交互验收。',
    '- 3D FPS 在 ready performance mark 后主动开启实体旋转并连续采样 5 秒；真机 GPU 仍需另行复验。',
    '',
    '## 路由结果',
    '',
    '| 网络 | 缓存 | 请求路由 / 最终路由 | 状态 | TTFB | FCP | LCP | CLS | INP | Long Task 最大值 | 传输量 | 缓存请求 | 可见 blur |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const pair of summary.results) {
    for (const result of [pair.cold, pair.warm]) {
      const pathLabel = result.route === result.finalPath ? result.route : `${result.route} / ${result.finalPath}`
      lines.push(`| ${pair.networkLabel} | ${result.cacheState === 'cold' ? '冷' : '暖'} | ${pathLabel} | ${result.measurementStatus} | ${formatMs(result.metrics.ttfb)} | ${formatMs(result.metrics.fcp)} | ${formatMs(result.metrics.lcp)} | ${result.metrics.cls.toFixed(4)} | ${formatMs(result.metrics.inp)} | ${formatMs(result.metrics.longTasks.maxMs)} | ${formatBytes(result.resources.transferBytes)} | ${result.resources.cachedRequests}/${result.resources.requests} | ${result.metrics.visibleBlurElements} |`)
    }
  }
  lines.push('', '## 资源分类（冷访问）', '', '| 网络 | 路由 | HTML | CSS | JS | 字体 | 图片 | 模型 | API | 总计 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const pair of summary.results) {
    const result = pair.cold
    const group = result.resources.byCategory
    lines.push(`| ${pair.networkLabel} | ${result.route} | ${formatBytes(group.html.transferBytes)} | ${formatBytes(group.css.transferBytes)} | ${formatBytes(group.js.transferBytes)} | ${formatBytes(group.font.transferBytes)} | ${formatBytes(group.image.transferBytes)} | ${formatBytes(group.model.transferBytes)} | ${formatBytes(group.api.transferBytes)} | ${formatBytes(result.resources.transferBytes)} |`)
  }
  lines.push('', '## 3D', '', '| 网络 | 缓存 | 启动前 | 启动后新增 | GLB | 点击到完整首帧 | 实体旋转 | 中位 FPS | 最低 1 秒 FPS | 5 秒分桶 | Range |', '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- |')
  for (const pair of summary.results.filter((item) => item.cold.three)) {
    for (const result of [pair.cold, pair.warm]) {
      const three = result.three
      lines.push(`| ${pair.networkLabel} | ${result.cacheState === 'cold' ? '冷' : '暖'} | ${formatBytes(result.preStartResources.transferBytes)} | ${formatBytes(three.addedTransferBytes)} | ${formatBytes(three.modelTransferBytes)} | ${formatMs(three.clickToFirstFrameMs)} | ${three.rotation?.active ? '已触发' : '未触发'} | ${three.fps?.medianFps ?? '未采集'} | ${three.fps?.minimumOneSecondFps ?? '未采集'} | ${three.fps?.oneSecondFps?.join(' / ') ?? '未采集'} | ${three.range?.status ?? '未采集'} ${three.range?.contentRange ?? ''} |`)
    }
  }
  const unmeasured = summary.results.flatMap((pair) => [pair.cold, pair.warm]
    .filter((result) => result.measurementStatus !== 'measured')
    .map((result) => `${pair.networkLabel} ${result.cacheState} ${result.route} -> ${result.finalPath} (${result.measurementStatus})`))
  if (unmeasured.length) lines.push('', '## 未测与路由偏差', '', ...unmeasured.map((item) => `- ${item}`))
  lines.push('', '## Fast 4G 自动门禁', '')
  for (const [name, passed] of Object.entries(summary.gates)) lines.push(`- ${passed ? '[x]' : '[ ]'} ${name}`)
  const resultLabel = summary.passed === null ? '观察完成（无阻断门禁）' : summary.passed ? '通过' : '未通过'
  lines.push('', `**结果：${resultLabel}**`, '', '受保护路由未提供测试身份时会明确标为未测并使路由覆盖门禁失败。Slow 4G、INP、真实 GPU 帧率、Android/iPhone 真机与三运营商结果仅作观察或仍需人工补验。', '')
  return lines.join('\n')
}

async function runMobileAudit() {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const selectedNetworkKeys = CLI_OPTIONS.network && CLI_OPTIONS.network !== 'all'
    ? [CLI_OPTIONS.network]
    : ['fast4g', 'slow4g']
  const requestedRoutes = CLI_OPTIONS.routes?.length
    ? new Set(CLI_OPTIONS.routes)
    : null
  const routesToAudit = requestedRoutes
    ? mobileRoutes.filter((route) => requestedRoutes.has(route.path) || requestedRoutes.has(route.name))
    : mobileRoutes
  if (!routesToAudit.length) throw new Error(`--routes 未匹配任何移动路由：${[...requestedRoutes].join(', ')}`)
  const results = []
  for (const networkKey of selectedNetworkKeys) {
    const network = mobileNetworkProfiles[networkKey]
    for (const route of routesToAudit) {
      process.stdout.write(`移动审计 ${network.label} / ${route.name} / 冷暖缓存 ... `)
      const pair = await runMobileRoutePair(route, networkKey, network)
      results.push(pair)
      process.stdout.write('完成\n')
    }
  }
  const thresholds = mobileThresholds()
  const gates = selectedNetworkKeys.includes('fast4g') ? calculateMobileGates(results, thresholds) : {}
  const summary = {
    schemaVersion: 2,
    mode: 'mobile',
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    chromePath: CHROME_PATH,
    privacy: {
      responseBodiesCaptured: false,
      queryStringsCaptured: false,
      responseHeaders: 'cache whitelist only',
    },
    emulation: {
      viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
      cpuRate: 4,
      networks: Object.fromEntries(selectedNetworkKeys.map((key) => [key, mobileNetworkProfiles[key]])),
    },
    thresholds,
    results,
    gates,
    sitewideTargets: results.flatMap(pair => [pair.cold, pair.warm].map(visit => ({
      network: pair.network,
      route: visit.route,
      cache: visit.cacheState,
      measured: visit.measurementStatus === 'measured',
      lcpTargetMs: pair.network === 'fast4g' ? 2500 : 4000,
      lcpPass: visit.metrics.lcp == null ? null : visit.metrics.lcp <= (pair.network === 'fast4g' ? 2500 : 4000),
      clsPass: visit.metrics.cls <= 0.1,
      inpPass: visit.metrics.inp == null ? null : visit.metrics.inp <= 200,
    }))),
    observations: {
      slow4gIsBlocking: false,
      inpRequiresRealDeviceVerification: true,
      inpSource: 'pre-registered Event Timing observer plus automated keyboard interaction',
      protectedRoutesRequireExplicitTestIdentity: true,
      protectedRouteIdentityProvided: Boolean(MOBILE_AUTH_TOKEN),
      headlessFpsRequiresRealGpuVerification: true,
    },
    passed: Object.keys(gates).length > 0 ? Object.values(gates).every(Boolean) : null,
  }
  await writeFile(join(OUTPUT_DIR, 'mobile-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  await writeFile(join(OUTPUT_DIR, 'mobile-summary.md'), renderMobileMarkdown(summary))
  process.stdout.write(`${JSON.stringify({
    mode: summary.mode,
    generatedAt: summary.generatedAt,
    baseUrl: summary.baseUrl,
    reports: ['mobile-summary.json', 'mobile-summary.md'],
    gates: summary.gates,
    passed: summary.passed,
  }, null, 2)}\n`)
  if (selectedNetworkKeys.includes('fast4g') && !summary.passed) process.exitCode = 1
}

async function runPointerAudit() {
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
const reducedTransparencyDotField = exploreNormal?.accessibility?.['reduced-transparency']?.dotField
const accessibilityModes = ['reduced-motion', 'high-contrast', 'forced-colors']
const accessibilityPasses = (result) => accessibilityModes.every((mode) => {
  const state = result?.accessibility?.[mode]
  return state?.tier === 'static'
    && state.cursorEnabled === false
    && state.cursorCount === 0
    && (!state.dotField || state.dotField.display === 'none' || state.dotField.state === 'disabled')
    && state.horizontalOverflow === 0
    && state.clippedControls.length === 0
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
  ordinaryDotFieldActivates: exploreNormal?.motion.dotFieldActivated === true,
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
  reducedTransparencyRemovesSpotlight: exploreNormal?.accessibility?.['reduced-transparency']?.surface === null
    || exploreNormal?.accessibility?.['reduced-transparency']?.surface?.spotlightDisplay === 'none',
  reducedTransparencyKeepsOpaqueDotField: Boolean(reducedTransparencyDotField
    && reducedTransparencyDotField.palette === 'opaque'
    && reducedTransparencyDotField.pointerEvents === 'none'
    // Explore intentionally hides this decorative canvas; visible instances must stay active.
    && (reducedTransparencyDotField.display === 'none' || reducedTransparencyDotField.state !== 'disabled')),
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
}

if (CLI_OPTIONS.mode === 'mobile') await runMobileAudit()
else await runPointerAudit()
