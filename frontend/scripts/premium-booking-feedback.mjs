import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { measureFeedbackContrast } from './premium-feedback-contrast.mjs'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4201'
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const environmentFile = process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/pocketbay-environment.json'
const env = JSON.parse(await readFile(environmentFile, 'utf8'))
const login = await fetch(`${baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert.equal(login.status, 200)
const token = (await login.json()).data.accessToken
const visitDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000))
const slots = [{ id: 920001, visitDate, startTime: '09:00:00', endTime: '11:00:00', remainingPeople: 20 }]
const output = resolve('../artifacts/premium-visual-2026-09-10/booking-feedback')
await mkdir(output, { recursive: true })
const report = { complete: false, baseURL, buildSignature: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of (process.env.AUDIT_WIDTH ? [Number(process.env.AUDIT_WIDTH)] : [390, 1440])) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale, token }) => {
      localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', locale); localStorage.setItem('heluo.access-token', token)
    }, { theme, locale, token })
    const page = await context.newPage(), label = `${width}-${theme}-${locale}`, english = locale === 'en-US'
    const result = { label, checks: [], screenshots: [], writes: [], contrast: [] }
    report.current = result
    let release, mode = 'pending', reads = 0
    let hold = new Promise(resolve => { release = resolve })
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
      if (method === 'GET' && path.endsWith('/appointment-slots')) {
        reads++
        if (mode === 'pending') await hold
        return route.fulfill({ status: mode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'error' ? { message: 'Temporary service failure' } : { data: mode === 'empty' ? [] : slots }) })
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        assert.equal(path, '/api/v1/appointments'); assert.equal(method, 'POST')
        result.writes.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
        if (mode === 'pending') await hold
        return route.fulfill({ status: mode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'error' ? { message: 'Temporary service failure' } : { data: { appointmentNo: 'UI-AUDIT-NOT-A-REAL-BOOKING' } }) })
      }
      return route.continue()
    })
    const shot = async (name, target) => {
      await target.scrollIntoViewIfNeeded()
      await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
      if (width === 1440) await target.evaluate(el => window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 140, behavior: 'instant' }))
      const scrollBefore = await page.evaluate(() => scrollY)
      await page.waitForTimeout(350)
      const scrollAfterWait = await page.evaluate(() => scrollY)
      await page.screenshot({ path: resolve(output, `${label}-${name}.png`) })
      result.lastScroll = { name, scrollBefore, scrollAfterWait, scrollAfterShot: await page.evaluate(() => scrollY) }
      result.screenshots.push(name)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    }
    const auditText = async (name, selector) => {
      await shot(name, page.locator(selector))
      const measured = await measureFeedbackContrast(page, selector)
      result.contrast.push({ name, measured })
      if (!measured.length) result.emptySampleDebug = await page.locator(selector).evaluate(el => {
        const result = []
        for (let parent = el; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), rect = parent.getBoundingClientRect()
          result.push({ tag: parent.tagName, class: parent.className, top: rect.top, bottom: rect.bottom, overflow: style.overflow, scrollTop: parent.scrollTop, opacity: style.opacity })
        }
        return result
      })
      assert.ok(measured.length && measured.every(sample => sample.count && sample.minimum >= sample.threshold), JSON.stringify(measured))
    }
    await page.goto(`${baseURL}/appointment`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.appointment-calendar-loading')).toBeVisible()
    await shot('calendar-pending', page.locator('.appointment-calendar-loading'))
    mode = 'error'; release()
    const retry = page.locator('.appointment-empty').getByRole('button')
    await expect(retry).toBeVisible()
    await auditText('calendar-error', '.appointment-empty')
    mode = 'empty'; await retry.click()
    await expect(page.locator('.appointment-inline-note')).toBeVisible()
    await shot('calendar-empty', page.locator('.appointment-inline-note'))
    mode = 'success'; await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.appointment-day:not(:disabled)')).toHaveCount(1)
    // The router restores the route position after its 240ms transition.
    await page.waitForTimeout(350)
    assert.equal(reads, 3)
    await page.locator('.appointment-day:not(:disabled)').click()
    await page.locator('.appointment-time:not(:disabled)').click()
    result.checks.push('calendar-loading-error-retry-empty; reload-select-date-and-time')
    if (width === 390) await page.locator('.appointment-mobile-action .fluid-button').click()
    const form = page.locator('.appointment-details'), phone = form.locator('input[type=tel]')
    await form.locator('input[autocomplete=name]').fill('界面验收')
    await phone.fill('abc')
    await form.locator('input[type=email]').fill('visual-audit@example.test')
    const submit = form.locator('button[type=submit]')
    await submit.click()
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(phone).toHaveAccessibleDescription(english ? 'Enter a valid contact number.' : '请填写有效的联系电话。')
    assert.equal(result.writes.length, 0)
    await auditText('phone-invalid', '.appointment-contact-fields')
    await phone.fill('13800138000')
    mode = 'pending'; hold = new Promise(resolve => { release = resolve })
    await submit.click()
    await expect(submit).toBeDisabled(); await expect(phone).toBeDisabled()
    await shot('submit-pending', submit)
    mode = 'error'; release()
    const errorSelector = width === 390 ? '.bottom-sheet [data-submit-error]' : '.appointment-main [data-submit-error]'
    await expect(page.locator(errorSelector)).toContainText(english ? 'not confirmed' : '暂未确认')
    await expect(phone).toBeDisabled()
    await auditText('submit-uncertain', errorSelector)
    if (width === 390) {
      await page.keyboard.press('Escape')
      await expect(page.locator('.appointment-mobile-action .fluid-button')).toBeFocused()
      await page.locator('.appointment-mobile-action .fluid-button').click()
      await expect(phone).toHaveValue('13800138000')
      result.checks.push('uncertain-sheet-close-reopen-retains-draft')
    }
    mode = 'success'; await submit.click()
    const successSelector = width === 390 ? '.bottom-sheet .appointment-result' : '.appointment-main .appointment-result'
    await expect(page.locator(successSelector)).toContainText('UI-AUDIT-NOT-A-REAL-BOOKING')
    await auditText('submit-success', successSelector)
    assert.equal(result.writes.length, 2)
    assert.ok(result.writes[0].key); assert.equal(result.writes[0].key, result.writes[1].key)
    assert.deepEqual(result.writes[0].body, result.writes[1].body)
    await expect(submit).toBeDisabled()
    result.checks.push('invalid-phone-associated-no-write; submitting-locks; uncertain-keeps-draft; retry-same-key-and-body; success-prevents-resubmit')
    report.results.push(result); delete report.current
    await context.close()
  }
  report.complete = true
} catch (error) {
  report.error = String(error)
  throw error
} finally {
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ complete: report.complete, groups: report.results.length, buildSignature: report.buildSignature }))
