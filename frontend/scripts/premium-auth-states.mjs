import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const env = JSON.parse(await readFile('../artifacts/sitewide-quality/current-environment.json', 'utf8'))
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const output = resolve('../artifacts/premium-visual-2026-09-10/auth-states')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const name = `${width}-${theme}-${locale}`
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    try {
      // All POSTs stay in browser interception; no accounts, emails or login failures reach the server.
      let release
      const pending = new Promise(resolve => { release = resolve })
      await page.route('**/api/v1/auth/login', async route => {
        await pending
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: locale === 'zh-CN' ? '验收模拟：请稍后重试。' : 'Audit simulation: please retry.' }) })
      })
      await page.route('**/api/v1/auth/password-reset/request', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'OK', data: null }) }))
      await page.goto(`${env.baseURL}/login`, { waitUntil: 'domcontentloaded' })
      const username = page.locator('input[autocomplete="username"]')
      const password = page.locator('input[autocomplete="current-password"]')
      const submit = page.locator('form button[type="submit"]')
      await username.fill('visual_audit')
      await password.fill('audit_example_only')
      await page.locator('.password-toggle').click()
      await expect(password).toHaveAttribute('type', 'text')
      await expect(page.locator('.password-toggle')).toHaveAttribute('aria-pressed', 'true')
      await page.locator('.password-toggle').click()
      await expect(password).toHaveAttribute('type', 'password')
      await submit.click()
      await expect(submit).toBeDisabled()
      await expect(password).toBeDisabled()
      await page.screenshot({ path: resolve(output, `${name}-pending.png`) })
      release()
      await expect(page.locator('.inline-status--error')).toBeVisible()
      await expect(submit).toBeEnabled()
      await page.screenshot({ path: resolve(output, `${name}-error.png`) })
      await page.locator('.auth-switch button').last().click()
      await expect(page.locator('.inline-status--error')).toHaveCount(0)
      await page.locator('input[type="email"]').fill('audit@example.test')
      await submit.click()
      await expect(page.locator('.inline-status--success')).toBeVisible()
      await page.screenshot({ path: resolve(output, `${name}-success.png`) })
      await page.locator('.auth-switch button').click()
      await expect(page.locator('.inline-status--success')).toHaveCount(0)
      await expect(password).toBeVisible()
      results.push({ name, passed: true, scope: 'Real password toggle, pending/disabled, error recovery, reset success, mode-change feedback clearing; mocked API responses' })
    } catch (error) {
      results.push({ name, passed: false, error: error.message })
      await page.screenshot({ path: resolve(output, `${name}-failure.png`) })
    } finally { await context.close() }
    await writeFile(resolve(output, 'summary.json'), JSON.stringify(results, null, 2))
    console.log(`${name}: ${results.at(-1).passed ? 'PASS' : 'FAIL'}`)
  }
} finally { await browser.close() }
if (results.some(r => !r.passed)) process.exitCode = 1
