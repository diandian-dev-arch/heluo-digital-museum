import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const outer = 'https://heluo.pocketbay.app/'
const output = new URL('../../artifacts/readme-live-home/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = { capturedAt: new Date().toISOString(), source: outer, viewport: { width: 1440, height: 900 }, captures: [] }
const authenticated = process.argv.includes('--authenticated')
if (authenticated) evidence.viewport = { width: 1680, height: 1100 }
try {
  const wake = await browser.newPage()
  await wake.goto(outer, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const button = wake.getByRole('button', { name: /唤醒并继续|Wake and continue/i })
  if (await button.isVisible()) await button.click({ noWaitAfter: true })
  await wake.locator('iframe#pb-host-frame').waitFor({ timeout: 120000 })
  const inner = new URL(await wake.locator('iframe#pb-host-frame').getAttribute('src'), outer).href
  assert.equal(new URL(inner).hostname, 'heluo--e.pocketbay.app')
  evidence.applicationUrl = inner
  await wake.close()
  let token = ''
  if (authenticated) {
    assert(process.env.HELUO_CAPTURE_CREDENTIAL_FILE, 'Set HELUO_CAPTURE_CREDENTIAL_FILE to the ignored deployment properties file')
    const properties = await readFile(process.env.HELUO_CAPTURE_CREDENTIAL_FILE, 'utf8')
    const value = key => properties.split(/\r?\n/).find(line => line.startsWith(key + '='))?.slice(key.length + 1).trim()
    const response = await browser.newContext()
    const login = await response.request.post(new URL('/api/v1/auth/login', inner).href, { data: {
      username: value('museum.bootstrap.admin-username'), password: value('museum.bootstrap.admin-password'),
    } })
    assert(login.ok(), `Login failed: HTTP ${login.status()}`)
    const payload = await login.json()
    assert(payload.data?.user?.roles.includes('ADMIN'), 'Administrator role required')
    token = payload.data.accessToken
    await response.close()
  }
  const scenarios = process.argv.includes('--supplement') ? [
    ['dark', 'en-US', 'gallery-dark-en.png', '/exhibits'],
    ['dark', 'en-US', 'booking-dark-en.png', '/appointment'],
    ['dark', 'en-US', 'digital-exhibit-dark-en.png', '/exhibits/heluo-bronze-ding-3d'],
  ] : authenticated ? [
    ['dark', 'en-US', 'shop-dark-en.png', '/shop'],
    ['dark', 'zh-CN', 'admin-content-dark-zh.png', '/admin'],
    ['light', 'zh-CN', 'admin-content-light-zh.png', '/admin'],
    ['dark', 'zh-CN', 'admin-products-dark-zh.png', '/admin/operations', '商品'],
    ['dark', 'zh-CN', 'admin-exhibits-dark-zh.png', '/admin/operations', '3D 展项'],
  ] : [
    ['light', 'zh-CN', 'home-light-zh.png', '/'],
    ['dark', 'zh-CN', 'home-dark-zh.png', '/'],
    ['dark', 'en-US', 'home-dark-en.png', '/'],
    ['dark', 'en-US', 'explore-dark-en.png', '/explore'],
    ['dark', 'en-US', 'shop-dark-en.png', '/shop'],
  ]
  for (const [theme, locale, file, route, tab] of scenarios) {
    if (process.env.HELUO_CAPTURE_ONLY && file !== process.env.HELUO_CAPTURE_ONLY) continue
    const page = await browser.newPage({ viewport: evidence.viewport, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ theme, locale, token }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
      if (token && location.hostname === 'heluo--e.pocketbay.app') localStorage.setItem('heluo.access-token', token)
    }, { theme, locale, token })
    await page.goto(outer, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('#pb-host-frame').waitFor({ timeout: 60000 })
    const app = page.frameLocator('#pb-host-frame')
    try { await app.locator('main h1').waitFor({ timeout: 60000 }) }
    catch (error) {
      console.log(JSON.stringify({ url: page.url(), text: await page.locator('body').innerText(), frames: page.frames().map(f => f.url()) }))
      await page.screenshot({ path: fileURLToPath(new URL('blocked.png', output)), fullPage: true })
      throw error
    }
    const frame = page.frames().find(f => f.url().startsWith(inner))
    assert(frame)
    const closeAd = page.locator('#pb-host-chip-close')
    if (await closeAd.isVisible()) await closeAd.click()
    // Presentation-only: remove the remaining collapsed platform widget, never alter the app.
    await page.addStyleTag({ content: '#pb-host-widget,#pb-host-mark{visibility:hidden!important}' })
    assert.equal(await page.locator('#pb-host-widget').isVisible(), false)
    if (route !== '/') {
      if (route.startsWith('/admin') || route.startsWith('/exhibits/')) await frame.goto(new URL(route, inner).href, { waitUntil: 'domcontentloaded' })
      else await app.locator(`header a[href="${route}"]:visible`).first().click()
      await frame.waitForURL(url => url.pathname === route)
      await app.locator('main h1').waitFor()
      if (route === '/explore') await app.locator('.gallery-object').first().waitFor()
      if (route === '/shop') await app.locator('main img').first().waitFor()
      if (route.startsWith('/exhibits/')) {
        const start = app.locator('.viewer-poster-start')
        if (await start.isVisible()) await start.click()
        await app.locator('.viewer-tools button:not([disabled])').first().waitFor({ timeout: 120000 })
        await page.waitForTimeout(2000)
      }
      if (tab) await app.getByRole('tab', { name: tab, exact: true }).click()
      if (route.startsWith('/admin')) {
        await app.locator('.admin-list article, tbody tr').first().waitFor()
        await page.waitForTimeout(1200)
      }
    }
    await frame.evaluate(() => document.fonts.ready)
    for (let y = 0; y < await frame.evaluate(() => document.documentElement.scrollHeight); y += 600) {
      await frame.evaluate(y => window.scrollTo(0, y), y)
      await page.waitForTimeout(250)
    }
    await frame.evaluate(async () => {
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})))
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(1000)
    if (route.startsWith('/admin') || route === '/appointment') {
      // Capture the entire admin workspace in one frame so its sticky sidebar never repeats.
      const height = await frame.evaluate(() => document.documentElement.scrollHeight)
      await page.setViewportSize({ width: evidence.viewport.width, height: height + 39 })
      await frame.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(400)
    }
    const state = await frame.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      locale: document.documentElement.lang,
      title: document.querySelector('h1')?.textContent,
      width: innerWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      footer: document.querySelector('footer')?.textContent,
      images: [...document.images].map(i => ({ src: i.currentSrc, loaded: i.complete && i.naturalWidth > 0 })),
      scripts: [...document.scripts].filter(s => s.src).map(s => s.src),
    }))
    assert.equal(state.theme, theme)
    assert.equal(state.locale, locale)
    assert.equal(state.overflow, false)
    if (route === '/' || route === '/explore') assert(state.footer?.trim())
    assert(state.height >= state.viewportHeight)
    assert(state.images.every(i => i.loaded), 'Unloaded images')
    assert.deepEqual(errors, [])
    const tiles = []
    for (let y = 0; ; y += state.viewportHeight - 180) {
      await frame.evaluate(y => window.scrollTo(0, y), y)
      await page.waitForTimeout(300)
      const actual = await frame.evaluate(() => scrollY)
      const tile = file.replace('.png', `-tile-${tiles.length}.png`)
      await page.locator('#pb-host-frame').screenshot({
        path: fileURLToPath(new URL(tile, output)),
        style: '#pb-host-widget,#pb-host-badge,#pb-host-mark,#pb-host-banner{visibility:hidden!important}',
      })
      tiles.push({ file: tile, y: actual })
      if (actual + state.viewportHeight >= state.height - 1) break
    }
    evidence.captures.push({ file, route, theme, locale, ...state, tiles, errors, platformWidgetHidden: true, authenticated })
    console.log(JSON.stringify({ file, width: state.width, height: state.height, title: state.title, theme: state.theme, locale: state.locale }))
    await page.close()
  }
  if (authenticated) {
    const previous = JSON.parse(await readFile(new URL('capture.json', output), 'utf8'))
    evidence.captures = [...previous.captures.filter(c => !evidence.captures.some(n => n.file === c.file)), ...evidence.captures]
  }
  await writeFile(new URL('capture.json', output), JSON.stringify(evidence, null, 2) + '\n')
} finally {
  await browser.close()
}
