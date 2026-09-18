import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE_URL = process.env.HELUO_BASE_URL ?? 'http://localhost:8088'
const OUTPUT_DIR = resolve(process.cwd(), '..', 'artifacts', 'page-mapping')
const CHROME_PATH = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync)

if (!CHROME_PATH) throw new Error('未找到 Chrome。可通过 CHROME_PATH 指定可执行文件。')

const routes = [
  { name: 'home', path: '/', readySelector: '.corridor-home' },
  { name: 'explore', path: '/explore', readySelector: '.collection-page #collection-title' },
  { name: 'exhibits', path: '/exhibits', readySelector: '.exhibits-intro' },
  { name: 'appointment', path: '/appointment', readySelector: '.appointment-heading' },
  { name: 'shop', path: '/shop', readySelector: '#shop-products' },
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
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener('open', resolveOpen, { once: true })
      this.socket.addEventListener('error', rejectOpen, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { method, resolve: resolveSend, reject: rejectSend })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket?.close()
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
  throw new Error(`等待 Chrome 调试端口超时：${url}`)
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitForReady(client, selector, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await evaluate(client, `document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    if (ready) return
    await sleep(100)
  }
  throw new Error(`页面未出现就绪元素：${selector}`)
}

async function inspectPage(client, route, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await client.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-reduced-transparency', value: 'no-preference' },
      { name: 'prefers-contrast', value: 'no-preference' },
      { name: 'forced-colors', value: 'none' },
    ],
  })
  await client.send('Page.navigate', { url: `${BASE_URL}${route.path}` })
  await waitForReady(client, route.readySelector)
  await sleep(250)

  const dotFieldTarget = await evaluate(client, `(() => {
    const canvas = document.querySelector('[data-pointer-dot-field]')
    const host = canvas?.parentElement
    if (!canvas || !host) return null
    const rect = host.getBoundingClientRect()
    return { x: rect.left + rect.width * .52, y: rect.top + rect.height * .52 }
  })()`)
  if (dotFieldTarget) {
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dotFieldTarget.x, y: dotFieldTarget.y, button: 'none', pointerType: 'mouse' })
    await sleep(180)
  }

  if (route.name === 'shop') {
    const bounds = await evaluate(client, `(() => {
      const element = document.querySelector('.shop-object-studio-surface')
      if (!element || getComputedStyle(element).display === 'none') return null
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width * .22, y: rect.top + rect.height * .32 }
    })()`)
    if (bounds) {
      await evaluate(client, `(() => {
        const element = document.querySelector('.shop-object-studio-surface')
        const options = { bubbles: true, pointerType: 'mouse', clientX: ${bounds.x}, clientY: ${bounds.y} }
        element.dispatchEvent(new PointerEvent('pointerenter', options))
        element.dispatchEvent(new PointerEvent('pointermove', options))
      })()`)
      await sleep(180)
    }
  }

  const state = await evaluate(client, `(() => {
    const controls = [...document.querySelectorAll('button, input, select, textarea')].filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
    })
    const clippedControls = controls.filter((element) => {
      const hasOverflow = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
      if (!hasOverflow) return false
      // Galaxy buttons deliberately keep their decorative fill outside the
      // viewport while it translates. Measure the readable label instead of
      // treating that hidden decorative layer as clipped button text.
      if (element.matches('[data-galaxy-button]')) {
        const label = element.querySelector('.fluid-button__label')
        return !label || label.getBoundingClientRect().height > element.clientHeight + 1
      }
      return true
    })
    const studio = document.querySelector('.shop-object-studio-surface')
    const studioStyle = studio ? getComputedStyle(studio) : null
    const dotFields = [...document.querySelectorAll('[data-pointer-dot-field]')]
    const dotField = dotFields[0]
    const dotFieldStyle = dotField ? getComputedStyle(dotField) : null
    return {
      viewport: { width: innerWidth, height: innerHeight },
      motionTier: document.documentElement.dataset.motionTier ?? null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedControls: clippedControls.slice(0, 10).map((element) => ({
        label: (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().replace(/\\s+/g, ' '),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
      surfaceCount: document.querySelectorAll('[data-pointer-surface]').length,
      activeSurfaceCount: document.querySelectorAll('[data-pointer-active]').length,
      cursorCount: document.querySelectorAll('.pointer-cursor').length,
      dotField: dotField ? {
        count: dotFields.length,
        state: dotField.getAttribute('data-state'),
        display: dotFieldStyle.display,
        pointerEvents: dotFieldStyle.pointerEvents,
        width: dotField.width,
        height: dotField.height,
      } : { count: 0 },
      studio: studio ? {
        display: studioStyle.display,
        inlineTransform: studio.style.transform,
        active: studio.hasAttribute('data-pointer-active'),
      } : null,
    }
  })()`)

  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  const screenshotName = `${route.name}-${width}x${height}.png`
  await writeFile(join(OUTPUT_DIR, screenshotName), Buffer.from(screenshot.data, 'base64'))
  return { ...state, screenshot: screenshotName }
}

await rm(OUTPUT_DIR, { recursive: true, force: true })
await mkdir(OUTPUT_DIR, { recursive: true })

const port = 9400 + Math.floor(Math.random() * 400)
const profileDir = join(tmpdir(), `heluo-page-mapping-${Date.now()}`)
const chrome = spawn(CHROME_PATH, [
  '--headless=new',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' })

let client
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`)
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  if (!targetResponse.ok) throw new Error(`创建 Chrome 标签页失败：HTTP ${targetResponse.status}`)
  const target = await targetResponse.json()
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.connect()
  await client.send('Page.enable')
  await client.send('Runtime.enable')

  const results = {}
  for (const route of routes) {
    results[route.name] = {}
    for (const [width, height] of viewports) {
      const key = `${width}x${height}`
      process.stdout.write(`审计 ${route.name} / ${key} ... `)
      results[route.name][key] = await inspectPage(client, route, width, height)
      process.stdout.write('完成\n')
    }
  }

  const states = Object.values(results).flatMap((routeResult) => Object.values(routeResult))
  const homeStates = Object.values(results.home)
  const shopStates = Object.values(results.shop)
  const sceneStates = [...homeStates, ...Object.values(results.exhibits), ...Object.values(results.explore), ...Object.values(results.appointment)]
  const zeroSpatialTransform = (state) => !state.studio
    || state.studio.display === 'none'
    || (state.motionTier !== 'full' && ['', 'none'].includes(state.studio.inlineTransform))
    || /^perspective\(.+\) rotateX\(0\.000deg\) rotateY\(0\.000deg\) translate3d\(0, 0\.000px, 0\)$/.test(state.studio.inlineTransform)

  const gates = {
    noHorizontalOverflow: states.every((state) => state.horizontalOverflow <= 1),
    noClippedControls: states.every((state) => state.clippedControls.length === 0),
    approvedHeroesHaveOneDotField: sceneStates.every((state) => state.dotField.count === 1),
    dotFieldsAreNonBlocking: sceneStates.every((state) => state.dotField.pointerEvents === 'none'),
    dotFieldsHavePixels: sceneStates.every((state) => state.dotField.width > 0 && state.dotField.height > 0),
    dotFieldsActivateInFullTier: sceneStates.every((state) => state.motionTier !== 'full' || state.dotField.state === 'active'),
    homeUsesOnlyL1: homeStates.every((state) => state.surfaceCount === 0),
    shopStudioSpotlightActivates: shopStates.every((state) => state.studio?.display === 'none'
      || (state.motionTier === 'full' ? state.studio?.active : !state.studio?.active)),
    shopStudioHasNoSpatialMotion: shopStates.every(zeroSpatialTransform),
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewports: viewports.map(([width, height]) => `${width}x${height}`),
    results,
    gates,
    passed: Object.values(gates).every(Boolean),
  }
  await writeFile(join(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(JSON.stringify({ gates, passed: summary.passed }, null, 2))
  if (!summary.passed) process.exitCode = 1
} finally {
  client?.close()
  chrome.kill()
  await rm(profileDir, { recursive: true, force: true }).catch(() => undefined)
}
