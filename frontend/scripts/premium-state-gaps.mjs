import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const baseURL = 'http://127.0.0.1:4209'
const output = resolve('../artifacts/premium-visual-2026-09-10/state-gaps-4209')
const expected = '2ca809f10772587e7b051efc80062c4d100bdd1eb65b317a06a64c86dbcfff08'
async function signature() {
  const response = await fetch(baseURL)
  assert.equal(response.status, 200)
  return createHash('sha256').update(await response.text()).digest('hex')
}
assert.equal(await signature(), expected)
await mkdir(output, { recursive: true })
const report = { complete: false, signature: expected, baseURL, results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const label = `${width}-${theme}-${locale}`
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const row = { label, checks: [], screenshots: [], pageErrors: [], unexpectedWrites: [] }
    report.results.push(row)
    page.on('pageerror', error => row.pageErrors.push(error.message))
    await page.route('**/api/**', route => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
      row.unexpectedWrites.push(new URL(route.request().url()).pathname)
      return route.abort()
    })
    async function shot(name, target) {
      await target.scrollIntoViewIfNeeded()
      await expect(target).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name)
      const file = `${label}-${name}.png`
      await page.screenshot({ path: resolve(output, file), animations: 'disabled' })
      row.screenshots.push(file)
    }
    try {
      for (const mode of ['register', 'reset']) {
        let release, outcome = 'pending', writes = 0
        const hold = new Promise(resolve => { release = resolve })
        const endpoint = mode === 'register' ? '**/api/v1/auth/register' : '**/api/v1/auth/password-reset/confirm'
        await page.route(endpoint, async route => {
          writes++
          if (outcome === 'pending') await hold
          await route.fulfill({ status: outcome === 'success' ? 200 : 503, contentType: 'application/json', body: JSON.stringify(outcome === 'success' ? { data: {} } : { message: 'Audit: temporarily unavailable; retry.' }) })
        })
        await page.goto(`${baseURL}/login${mode === 'reset' ? '?token=visual-audit-only' : ''}`, { waitUntil: 'domcontentloaded' })
        if (mode === 'register') {
          await page.locator('.auth-switch button').first().click()
          await page.locator('input[autocomplete="username"]').fill('visual_audit')
          await page.locator('input[autocomplete="nickname"]').fill('Visual audit')
        }
        const password = page.locator('input[autocomplete="new-password"]')
        await password.fill('audit_example_only')
        const submit = page.locator('form button[type="submit"]')
        try {
          await submit.click()
          await expect(submit).toBeDisabled()
          await expect(password).toBeDisabled()
          await shot(`${mode}-pending`, submit)
          assert.equal(writes, 1)
          outcome = 'error'; release()
          await expect(page.locator('.inline-status--error')).toBeVisible()
          await expect(password).toHaveValue('audit_example_only')
          await expect(submit).toBeEnabled()
          await shot(`${mode}-error`, page.locator('.inline-status--error'))
          outcome = 'success'; await submit.click()
          await expect(page.locator('.inline-status--success')).toBeVisible()
          await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible()
          assert.equal(writes, 2)
          await shot(`${mode}-success`, page.locator('.inline-status--success'))
          row.checks.push(`${mode}: pending-disabled/error-retains-password/retry-success-returns-login; 2 mocked requests`)
        } finally { release(); await page.unroute(endpoint) }
      }
      for (const kind of ['exhibits', 'detail']) {
        let path = '/exhibits', endpoint = '**/api/v1/exhibits', mode = 'pending', release
        if (kind === 'detail') {
          await page.goto(`${baseURL}/explore`, { waitUntil: 'domcontentloaded' })
          const link = page.locator('a[href^="/artifacts/"]').first()
          await expect(link).toBeVisible()
          path = await link.getAttribute('href')
          endpoint = `**/api/v1${path}`
        }
        const hold = new Promise(resolve => { release = resolve })
        await page.route(endpoint, async route => {
          if (mode === 'pending') await hold
          if (mode === 'live') return route.continue()
          await route.fulfill({ status: mode === 'empty' ? 200 : 503, contentType: 'application/json', body: JSON.stringify(mode === 'empty' ? { data: [] } : { message: 'Audit: temporarily unavailable; retry.' }) })
        })
        try {
          await page.goto(baseURL + path, { waitUntil: 'domcontentloaded' })
          const loading = page.locator('.loading-skeleton')
          await expect(loading).toBeVisible()
          await shot(`${kind}-loading`, loading)
          mode = 'error'; release()
          const error = page.locator('.inline-status--error')
          await expect(error).toBeVisible()
          await shot(`${kind}-error`, error)
          const retry = page.locator(kind === 'exhibits' ? '.state-panel__action' : '.detail-state button')
          mode = kind === 'exhibits' ? 'empty' : 'live'
          await retry.click()
          if (kind === 'exhibits') {
            await expect(page.locator('.state-panel--action')).toBeVisible()
            await shot('exhibits-empty', page.locator('.state-panel--action'))
            mode = 'live'; await page.reload({ waitUntil: 'domcontentloaded' })
          }
          const content = page.locator(kind === 'exhibits' ? '.exhibit-grid' : '.detail-header')
          await expect(content).toBeVisible()
          await expect(error).toHaveCount(0)
          await shot(`${kind}-recovered`, content)
          row.checks.push(`${kind}: loading/error/retry/${kind === 'exhibits' ? 'empty/reload/' : ''}live`)
        } finally { release(); await page.unroute(endpoint) }
      }
      assert.deepEqual(row.pageErrors, [])
      assert.deepEqual(row.unexpectedWrites, [])
      row.passed = true
    } catch (error) {
      row.passed = false; row.error = error.message
      throw error
    } finally {
      await context.close()
      await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
    }
    console.log(`${label}: four state gaps passed`)
  }
  assert.equal(await signature(), expected)
  report.complete = true
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
}
