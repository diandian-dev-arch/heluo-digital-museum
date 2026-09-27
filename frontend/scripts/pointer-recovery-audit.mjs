import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://localhost:8088'
const output = resolve(process.env.HELUO_AUDIT_OUTPUT ?? '../artifacts/pointer-recovery-2026-09-08')
const routes = [
  { name: 'explore', path: '/explore', heading: '.gallery-intro', ready: '.gallery-objects' },
  { name: 'appointment', path: '/appointment', heading: '.appointment-heading', ready: '.appointment-dates' },
]
const results = []
const pageErrors = []
const networkIssues = []
let currentPage
let passed = false
let failure

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })

function observe(page) {
  currentPage = page
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('requestfailed', request => networkIssues.push({ url: request.url(), error: request.failure()?.errorText }))
  page.on('response', response => {
    if (response.status() >= 400) networkIssues.push({ url: response.url(), status: response.status() })
  })
}

async function inspect(page) {
  return page.evaluate(() => {
    const field = document.querySelector('[data-pointer-dot-field]')
    const cursor = document.querySelector('.pointer-cursor')
    const style = field ? getComputedStyle(field) : null
    let pixels = 0
    let fingerprint = 0
    if (field?.width && field.height) {
      const data = field.getContext('2d').getImageData(0, 0, field.width, field.height).data
      for (let index = 3; index < data.length; index += 4) {
        if (data[index]) pixels += 1
        fingerprint = (Math.imul(fingerprint, 31) + data[index]) | 0
      }
    }
    return {
      tier: document.documentElement.dataset.motionTier,
      enabled: document.documentElement.classList.contains('pointer-motion-enabled'),
      cursorCount: document.querySelectorAll('.pointer-cursor').length,
      cursorVisible: Boolean(cursor?.classList.contains('is-visible')),
      fieldCount: document.querySelectorAll('[data-pointer-dot-field]').length,
      field: field ? { state: field.dataset.state, renderer: field.dataset.renderer, width: field.width, height: field.height, display: style.display, pointerEvents: style.pointerEvents, pixels, fingerprint } : null,
      overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    }
  })
}

async function ready(page, route) {
  await page.locator(route.ready).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('main img')]
    .filter(image => image.getBoundingClientRect().top < innerHeight && image.getBoundingClientRect().bottom > 0)
    .every(image => image.complete && image.naturalWidth > 0))
}

async function verifyWave(page, route, theme, phase = 'initial') {
  await ready(page, route)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.mouse.move(4, 4)
  const field = page.locator('[data-pointer-dot-field]')
  await expect(field).toHaveAttribute('data-renderer', 'canvas')
  const before = await inspect(page)
  const bounds = await page.locator(route.heading).boundingBox()
  assert(bounds?.width && bounds.height)
  await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .56, { steps: 12 })
  await expect(field).toHaveAttribute('data-state', 'active')
  await expect.poll(async () => (await inspect(page)).field.fingerprint).not.toBe(before.field.fingerprint)
  const active = await inspect(page)
  assert.equal(active.tier, 'full')
  assert.equal(active.cursorCount, 1)
  assert.equal(active.cursorVisible, true)
  assert.equal(active.fieldCount, 1)
  assert.equal(active.field.pointerEvents, 'none')
  assert(active.field.pixels > 0)
  assert.equal(active.overflow, 0)
  if (phase === 'initial') await page.screenshot({ path: resolve(output, `${route.name}-${theme}-active.png`) })
  results.push({ route: route.name, theme, phase, before, active })
}

try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'no-preference' })
    await context.addInitScript(value => localStorage.setItem('heluo.theme', value), theme)
    const page = await context.newPage()
    observe(page)
    await page.goto('/explore', { waitUntil: 'domcontentloaded' })
    await verifyWave(page, routes[0], theme)

    const category = page.getByRole('button', { name: '青铜礼器', exact: true })
    await category.hover()
    await expect(category).toHaveCSS('cursor', 'none')
    await category.click()
    await expect(page).toHaveURL(/category=BRONZE/)
    await expect(page.locator('.gallery-object')).toHaveCount(2)
    await page.getByRole('searchbox').fill('青铜')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await expect(page.locator('.gallery-result-card').first()).toBeVisible()
    await page.locator('.gallery-results > header .gallery-text-link').click()
    await expect(page.locator('.gallery-objects')).toBeVisible()

    await page.locator('.site-header a[href="/appointment"]').click()
    await verifyWave(page, routes[1], theme)
    const date = page.locator('.appointment-day:not(:disabled)').first()
    await date.hover()
    await expect(date).toHaveCSS('cursor', 'none')
    await date.click()
    await expect(date).toHaveAttribute('aria-pressed', 'true')
    const time = page.locator('.appointment-time:not(:disabled)').last()
    await expect(time).toHaveCSS('cursor', 'none')
    await time.click()
    await expect(time).toHaveAttribute('aria-pressed', 'true')
    const contact = page.locator('.appointment-field input').first()
    await contact.hover()
    await expect(contact).toHaveCSS('cursor', 'text')
    await expect(page.locator('.pointer-cursor')).toHaveAttribute('data-intent', 'native')
    await expect.poll(() => page.locator('.pointer-cursor').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
    await contact.fill('Pointer verification')
    await expect(contact).toHaveValue('Pointer verification')

    await contact.press('Tab')
    await expect(page.locator('.pointer-cursor')).toHaveCount(0)
    await expect(page.locator('[data-pointer-dot-field]')).toHaveAttribute('data-state', 'disabled')
    await verifyWave(page, routes[1], theme, 'keyboard-to-mouse')

    await page.locator('.site-header a[href="/shop"]').click()
    await page.locator('#shop-products').waitFor()
    await expect(page.locator('.pointer-cursor')).toHaveCount(0)
    await page.locator('.site-header a[href="/explore"]').click()
    await verifyWave(page, routes[0], theme, 'disabled-route-to-explore')
    await context.close()
    console.log(`${theme}: pointer pixels, SPA navigation, search and booking controls passed`)
  }

  for (const mode of ['touch', 'reduced-motion', 'forced-colors', 'reduced-transparency']) {
    const touch = mode === 'touch'
    const context = await browser.newContext({
      baseURL, viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, locale: 'zh-CN',
      reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference',
      forcedColors: mode === 'forced-colors' ? 'active' : 'none',
    })
    const page = await context.newPage()
    observe(page)
    if (mode === 'reduced-transparency') {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
    }
    for (const route of routes) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      await ready(page, route)
      await expect(page.locator('[data-pointer-dot-field]')).toHaveAttribute('data-renderer', mode === 'reduced-transparency' ? 'css' : 'none')
      const state = await inspect(page)
      assert.equal(state.field.width, 0)
      assert.equal(state.field.height, 0)
      assert.equal(state.overflow, 0)
      if (mode !== 'reduced-transparency') {
        assert.equal(state.cursorCount, 0)
        assert.equal(state.enabled, false)
        assert.equal(state.field.display, 'none')
        const control = page.locator(route.name === 'explore' ? '.gallery-filters button' : '.appointment-day:not(:disabled)').first()
        await expect(control).toHaveCSS('cursor', 'pointer')
      }
      if (touch) {
        await page.screenshot({ path: resolve(output, `${route.name}-touch.png`) })
        if (route.name === 'appointment') {
          await page.locator('.appointment-day:not(:disabled)').first().tap()
          await expect(page.locator('.appointment-time.active')).toBeVisible()
        }
      }
      results.push({ route: route.name, mode, state })
    }
    await context.close()
    console.log(`${mode}: both routes passed`)
  }
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(networkIssues, [])
  passed = true
  console.log(`Passed ${results.length} pointer recovery states; no page errors.`)
} catch (error) {
  failure = { message: error.message, url: currentPage?.url() }
  if (currentPage && !currentPage.isClosed()) {
    failure.content = await currentPage.locator('main').innerText().catch(() => '')
    await currentPage.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ baseURL, generatedAt: new Date().toISOString(), passed, failure, results, pageErrors, networkIssues }, null, 2))
  await browser.close()
}
