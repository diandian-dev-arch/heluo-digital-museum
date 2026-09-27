import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const env = JSON.parse(await readFile(process.env.HELUO_QUALITY_ENV_FILE, 'utf8'))
const baseURL = process.env.HELUO_BASE_URL ?? env.baseURL
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const login = await fetch(`${baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert.equal(login.status, 200)
const token = (await login.json()).data.accessToken
const output = resolve('../artifacts/holistic', `danger-route-${Date.now()}`)
await mkdir(output, { recursive: true })
const report = { baseURL, complete: false, results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ token, theme }) => {
      localStorage.setItem('heluo.access-token', token)
      localStorage.setItem('heluo.theme', theme)
    }, { token, theme })
    const page = await context.newPage()
    let writes = 0
    await page.route('**/api/v1/**', async route => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
      writes++
      await route.abort()
    })
    await page.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded' })
    const danger = page.locator('.admin-list .admin-action-button--danger').first()
    await expect(danger).toBeVisible()
    await danger.hover()
    const read = () => danger.evaluate(el => { const s = getComputedStyle(el); return { color: s.color, background: s.backgroundColor, border: s.borderColor, outline: s.outlineStyle, focus: el.matches(':focus-visible') } })
    const before = await read()
    await page.evaluate(() => { window.__dangerAuditDocument = 'same-document' })
    await page.locator(width < 760 ? '.admin-sidebar__brand' : '.admin-sidebar__exit').click()
    await expect(page).toHaveURL(`${baseURL}/`)
    await page.locator('.home-primary').click()
    await expect(page).toHaveURL(/\/explore/)
    await expect(page.locator('main')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(`${baseURL}/`)
    await page.goBack()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(danger).toBeVisible()
    assert.equal(await page.evaluate(() => window.__dangerAuditDocument), 'same-document')
    await danger.hover()
    assert.deepEqual(await read(), before, 'Loaded public route styles changed danger appearance')
    await page.emulateMedia({ forcedColors: 'active' })
    await page.keyboard.press('Tab')
    await danger.focus()
    const forced = await read()
    assert.ok(forced.focus && forced.outline !== 'none')
    const system = await page.evaluate(() => {
      const el = document.createElement('button'); el.style.cssText = 'color:ButtonText;background:ButtonFace;border-color:ButtonText'; document.body.append(el)
      const s = getComputedStyle(el), result = { color: s.color, background: s.backgroundColor, border: s.borderColor }; el.remove(); return result
    })
    assert.equal(forced.color, system.color)
    assert.equal(forced.background, system.background)
    assert.equal(forced.border, system.border)
    assert.equal(writes, 0)
    await page.screenshot({ path: resolve(output, `${width}-${theme}-forced-colors.png`) })
    report.results.push({ width, theme, before, forced, writes, passed: true })
    await context.close()
  }
  report.complete = true
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify({ output, complete: report.complete, groups: report.results.length }))
