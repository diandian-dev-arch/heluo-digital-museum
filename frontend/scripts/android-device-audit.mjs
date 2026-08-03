import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CDP_URL = process.env.HELUO_ANDROID_CDP_URL ?? 'http://127.0.0.1:9222'
const BASE_URL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:8088'
const OUTPUT_DIR = resolve(
  process.cwd(),
  '..',
  process.env.HELUO_ANDROID_OUTPUT ?? 'artifacts/real-device/vivo-x100-ultra-2026-08-03/cdp',
)

const routes = [
  { name: 'home', path: '/', selector: '.corridor-home' },
  { name: 'three', path: '/exhibits/heluo-bronze-ding-3d', selector: '.three-canvas', three: true },
  { name: 'appointment', path: '/appointment', selector: '.booking-page', appointment: true },
  { name: 'shop', path: '/shop', selector: '.shop-page', shop: true },
]
let testTargetId = null

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

  close() {
    this.socket?.close()
  }
}

async function getJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`)
  return response.json()
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

async function waitFor(client, expression, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return
    await sleep(150)
  }
  throw new Error(`等待页面状态超时：${expression}`)
}

async function connectToTarget(target) {
  const client = new CdpClient(target.webSocketDebuggerUrl)
  await client.connect()
  await Promise.all([
    client.send('Page.enable'),
    client.send('Runtime.enable'),
    client.send('Log.enable'),
    client.send('Network.enable'),
  ])
  return client
}

async function findTarget(expectedUrl, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const targets = await getJson(`${CDP_URL}/json`)
    const target = targets.find((item) => item.id === testTargetId && item.type === 'page' && (
      expectedUrl ? item.url === expectedUrl : item.url.startsWith(BASE_URL)
    ))
    if (target) return target
    await sleep(200)
  }
  throw new Error(`手机 Chrome 中未找到 ${expectedUrl ?? BASE_URL} 页面`)
}

async function openRoute(route) {
  const expectedUrl = new URL(route.path, BASE_URL).href
  const navigationClient = await connectToTarget(await findTarget())
  try {
    await navigationClient.send('Page.navigate', { url: expectedUrl })
  } catch (error) {
    if (!String(error).includes('Target crashed')) throw error
  } finally {
    navigationClient.close()
  }

  const client = await connectToTarget(await findTarget(expectedUrl))
  await waitFor(client, `document.readyState === 'complete' && Boolean(document.querySelector(${JSON.stringify(route.selector)}))`)
  if (route.three) {
    await waitFor(client, `document.querySelector('[data-render-state]')?.getAttribute('data-render-state') === 'running'`, 60_000)
    await waitFor(client, `!document.querySelector('.three-overlay') && !document.querySelector('.three-fallback')`, 60_000)
    // Android may need several compositor frames after GLTF decoding before the
    // PBR textures become visible in a captured frame.
    await sleep(2_500)
  }
  await sleep(500)
  return client
}

async function screenshot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  const fileName = `${name}.png`
  await writeFile(resolve(OUTPUT_DIR, fileName), Buffer.from(data, 'base64'))
  return fileName
}

async function selectorPoint(client, selector) {
  return evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
  })()`)
}

async function touch(client, type, points) {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point, index) => ({
      id: point.id ?? index,
      x: point.x,
      y: point.y,
      radiusX: 5,
      radiusY: 5,
      force: type === 'touchEnd' ? 0 : 1,
    })),
  })
}

async function tap(client, selector) {
  const visibility = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const viewportHeight = visualViewport?.height ?? innerHeight
    const viewportWidth = visualViewport?.width ?? innerWidth
    const visible = rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth
    if (!visible) element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    return { visible }
  })()`)
  if (!visibility) throw new Error(`找不到可触摸元素：${selector}`)
  if (!visibility.visible) await sleep(350)
  const point = await selectorPoint(client, selector)
  if (!point) throw new Error(`找不到可触摸元素：${selector}`)
  const hit = await evaluate(client, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)})
    const rect = target?.getBoundingClientRect()
    const element = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null
    return { target: target?.className ?? null, hit: element?.className || element?.tagName || null, targetContainsHit: Boolean(target && element && target.contains(element)) }
  })()`)
  if (!hit.targetContainsHit) throw new Error(`触摸目标被遮挡：${selector}，实际命中 ${hit.hit}`)
  await touch(client, 'touchStart', [point])
  await sleep(70)
  await touch(client, 'touchEnd', [])
  await sleep(400)
  return { ...point, hit }
}

async function swipe(client, start, end, steps = 8) {
  await touch(client, 'touchStart', [start])
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps
    await touch(client, 'touchMove', [{
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    }])
    await sleep(24)
  }
  await touch(client, 'touchEnd', [])
  await sleep(500)
}

async function pinch(client, bounds) {
  const centerX = bounds.left + bounds.width * .58
  const centerY = Math.max(bounds.top + 120, Math.min(bounds.bottom - 120, bounds.top + bounds.height * .52))
  const start = [
    { id: 0, x: centerX - 36, y: centerY },
    { id: 1, x: centerX + 36, y: centerY },
  ]
  await touch(client, 'touchStart', start)
  for (let index = 1; index <= 8; index += 1) {
    const distance = 36 + index * 8
    const rotation = index * .035
    await touch(client, 'touchMove', [
      { id: 0, x: centerX - Math.cos(rotation) * distance, y: centerY - Math.sin(rotation) * distance },
      { id: 1, x: centerX + Math.cos(rotation) * distance, y: centerY + Math.sin(rotation) * distance },
    ])
    await sleep(24)
  }
  await touch(client, 'touchEnd', [])
  await sleep(600)
}

async function readState(client) {
  return evaluate(client, `(() => {
    const controls = [...document.querySelectorAll('button, a, input, select, textarea, [role="tab"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
    const clippedControls = controls.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)
    const undersizedControls = controls.filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width < 44 || rect.height < 44
    })
    const bottomNav = document.querySelector('.mobile-tab-bar')?.getBoundingClientRect()
    const floating = [...document.querySelectorAll('.mobile-cart-trigger, .mobile-booking-trigger, .mobile-exhibit-info-trigger, .bottom-sheet')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const overlapsBottomNav = bottomNav && rect.left < bottomNav.right && rect.right > bottomNav.left && rect.top < bottomNav.bottom && rect.bottom > bottomNav.top
        return { selector: element.className, rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }, overlapsBottomNav: Boolean(overlapsBottomNav) }
      })
    return {
      title: document.title,
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, visualWidth: visualViewport?.width ?? null, visualHeight: visualViewport?.height ?? null, scale: visualViewport?.scale ?? null, devicePixelRatio },
      scroll: { x: scrollX, y: scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth },
      pointer: { fine: matchMedia('(pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches, customCursor: document.documentElement.classList.contains('pointer-motion-enabled'), cursorCount: document.querySelectorAll('.pointer-cursor').length },
      renderState: document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null,
      dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
      bottomNav: bottomNav ? { top: bottomNav.top, right: bottomNav.right, bottom: bottomNav.bottom, left: bottomNav.left, width: bottomNav.width, height: bottomNav.height } : null,
      floating,
      clippedControls: clippedControls.slice(0, 12).map((element) => (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().replace(/\\s+/g, ' ')),
      undersizedControls: undersizedControls.slice(0, 20).map((element) => ({ label: (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().replace(/\\s+/g, ' '), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) })),
    }
  })()`)
}

async function readEmbeddedTextureSupport(client) {
  return evaluate(client, `(async () => {
    const response = await fetch('/media/models/heluo-bronze-ding-v5.4.glb')
    const buffer = await response.arrayBuffer()
    const view = new DataView(buffer)
    const jsonLength = view.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).replace(/\\0+$/, ''))
    const binHeaderOffset = 20 + jsonLength
    const binStart = binHeaderOffset + 8
    return Promise.all(json.images.map(async (image) => {
      const bufferView = json.bufferViews[image.bufferView]
      const bytes = buffer.slice(binStart + (bufferView.byteOffset ?? 0), binStart + (bufferView.byteOffset ?? 0) + bufferView.byteLength)
      try {
        const bitmap = await Promise.race([
          createImageBitmap(new Blob([bytes], { type: image.mimeType })),
          new Promise((_, reject) => setTimeout(() => reject(new Error('decode timeout after 5000ms')), 5_000)),
        ])
        const result = { name: image.name, mimeType: image.mimeType, byteLength: bufferView.byteLength, decoded: true, width: bitmap.width, height: bitmap.height }
        bitmap.close()
        return result
      } catch (error) {
        return { name: image.name, mimeType: image.mimeType, byteLength: bufferView.byteLength, decoded: false, error: error instanceof Error ? error.message : String(error) }
      }
    }))
  })()`, true)
}

async function auditThree(client, result) {
  const canvas = await selectorPoint(client, '.three-canvas')
  result.canvas = canvas
  const startY = Math.min(innerHeightFallback(result) - 110, canvas.bottom - 70)
  const beforeScroll = await evaluate(client, 'scrollY')
  await swipe(client, { x: canvas.left + canvas.width * .72, y: startY }, { x: canvas.left + canvas.width * .72, y: Math.max(canvas.top + 80, startY - 260) })
  const afterScroll = await evaluate(client, 'scrollY')
  result.singleFingerScroll = { before: beforeScroll, after: afterScroll, passed: afterScroll > beforeScroll }
  await evaluate(client, 'scrollTo(0, 0)')
  await sleep(250)
  await pinch(client, canvas)
  result.pinch = {
    renderState: await evaluate(client, `document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null`),
  }
  await tap(client, '.mobile-exhibit-info-trigger')
  await waitFor(client, `Boolean(document.querySelector('[role="dialog"]'))`, 5_000)
  result.sheet = { opened: true, beforeDrag: await evaluate(client, `document.querySelector('.bottom-sheet')?.getAttribute('data-snap-point')`) }
  result.sheet.screenshot = await screenshot(client, '02-three-sheet')
  const handle = await selectorPoint(client, '.bottom-sheet-handle')
  await swipe(client, { x: handle.x, y: handle.y }, { x: handle.x, y: Math.max(80, handle.y - 180) })
  result.sheet.afterDrag = await evaluate(client, `document.querySelector('.bottom-sheet')?.getAttribute('data-snap-point')`)
  result.sheet.dragChangedSnapPoint = result.sheet.afterDrag !== result.sheet.beforeDrag
  await tap(client, '.mobile-exhibit-info .mode-switch button:nth-of-type(2)')
  await waitFor(client, `document.querySelector('.mobile-exhibit-info .mode-switch button:nth-of-type(2)')?.getAttribute('aria-pressed') === 'true'`, 5_000)
  // The production point-cloud decomposition settles in 2.4 seconds.
  await sleep(2_600)
  result.pointCloud = {
    active: await evaluate(client, `document.querySelector('.mobile-exhibit-info .mode-switch button:nth-of-type(2)')?.getAttribute('aria-pressed') === 'true'`),
    renderState: await evaluate(client, `document.querySelector('[data-render-state]')?.getAttribute('data-render-state') ?? null`),
    sheetScreenshot: await screenshot(client, '05-three-points-sheet'),
  }
  await tap(client, '.bottom-sheet-close')
  await waitFor(client, `!document.querySelector('[role="dialog"]')`, 5_000)
  result.sheet.closed = true
  await sleep(400)
  result.pointCloud.canvasScreenshot = await screenshot(client, '06-three-points-canvas')
}

function innerHeightFallback(result) {
  return result.initial.viewport.visualHeight ?? result.initial.viewport.height
}

async function auditAppointment(client, result) {
  await tap(client, '.mobile-booking-trigger')
  await waitFor(client, `Boolean(document.querySelector('[role="dialog"]'))`, 5_000)
  result.sheet = { opened: true, screenshot: await screenshot(client, '03-appointment-sheet') }
  const before = await evaluate(client, `({ innerHeight, visualHeight: visualViewport?.height ?? null })`)
  await tap(client, '.mobile-booking-form input')
  await sleep(900)
  const after = await evaluate(client, `({ innerHeight, visualHeight: visualViewport?.height ?? null, activePlaceholder: document.activeElement?.getAttribute('placeholder') })`)
  result.keyboard = { before, after, opened: Boolean(after.visualHeight && before.visualHeight && after.visualHeight < before.visualHeight - 80) }
  await evaluate(client, 'document.activeElement?.blur()')
  await sleep(350)
  await tap(client, '.bottom-sheet-close')
  await waitFor(client, `!document.querySelector('[role="dialog"]')`, 5_000)
  result.sheet.closed = true
}

async function auditShop(client, result) {
  await tap(client, '.mobile-cart-trigger')
  await waitFor(client, `Boolean(document.querySelector('[role="dialog"]'))`, 5_000)
  result.sheet = {
    opened: true,
    stateText: await evaluate(client, `document.querySelector('.cart-empty-state')?.innerText ?? null`),
    screenshot: await screenshot(client, '04-shop-cart-sheet'),
  }
  await tap(client, '.bottom-sheet-close')
  await waitFor(client, `!document.querySelector('[role="dialog"]')`, 5_000)
  result.sheet.closed = true
}

await mkdir(OUTPUT_DIR, { recursive: true })
const createdTarget = await getJson(`${CDP_URL}/json/new?${encodeURIComponent(BASE_URL)}`, { method: 'PUT' })
testTargetId = createdTarget.id
await findTarget()

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  cdpUrl: CDP_URL,
  targetId: testTargetId,
  evidenceBoundary: 'ADB/CDP 截图与合成触摸证明真机渲染和脚本事件响应，不代替真人手感判断。',
  routes: {},
}

try {
  for (const route of routes) {
    let client
    const activeRouteErrors = []
    const consoleEntries = []
  try {
    client = await openRoute(route)
    client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => activeRouteErrors.push(exceptionDetails.text || 'Runtime exception'))
    client.on('Log.entryAdded', ({ entry }) => {
      if (entry.level === 'error' || entry.level === 'warning') consoleEntries.push({ level: entry.level, text: entry.text, url: entry.url })
    })
    client.on('Network.loadingFailed', (event) => {
      if (!event.canceled) activeRouteErrors.push(`Network: ${event.errorText}`)
    })
    const result = { initial: await readState(client) }
    if (route.three) result.embeddedTextures = await readEmbeddedTextureSupport(client)
    result.screenshot = await screenshot(client, `01-${route.name}`)
    if (route.three) await auditThree(client, result)
    if (route.appointment) await auditAppointment(client, result)
    if (route.shop) await auditShop(client, result)
    result.final = await readState(client)
    result.runtimeErrors = [...activeRouteErrors]
    result.consoleEntries = [...consoleEntries]
    result.passed = result.initial.scroll.horizontalOverflow <= 1
      && result.initial.pointer.coarse
      && !result.initial.pointer.customCursor
      && result.runtimeErrors.length === 0
      && Boolean(result.initial.bottomNav)
      && !result.initial.floating.some((item) => item.overlapsBottomNav)
      && (!route.three || (result.singleFingerScroll.passed && result.pinch.renderState === 'running' && result.sheet.opened && result.pointCloud.active && result.pointCloud.renderState === 'running' && result.sheet.closed))
      && (!route.appointment || (result.sheet.opened && result.sheet.closed))
      && (!route.shop || (result.sheet.opened && result.sheet.closed))
    summary.routes[route.name] = result
  } catch (error) {
    summary.routes[route.name] = {
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      runtimeErrors: [...activeRouteErrors],
      consoleEntries: [...consoleEntries],
    }
  } finally {
    client?.close()
  }
  }
} finally {
  await fetch(`${CDP_URL}/json/close/${testTargetId}`).catch(() => undefined)
}

summary.passed = Object.values(summary.routes).every((route) => route.passed)
await writeFile(resolve(OUTPUT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(summary, null, 2))
if (!summary.passed) process.exitCode = 1
