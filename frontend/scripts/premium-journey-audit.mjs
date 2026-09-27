import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const env = JSON.parse(await readFile('../artifacts/sitewide-quality/current-environment.json', 'utf8'))
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const output = resolve('../artifacts/premium-visual-2026-09-10/journeys')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
async function record(page, name, check) {
  try { await check(); results.push({ name, passed: true }) }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false })
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(results, null, 2))
}
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const label = `${width}-${theme}`
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
    await context.addInitScript(theme => { localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', 'zh-CN') }, theme)
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    await record(page, `${label}-browse-search-detail-return-3d`, async () => {
      await page.goto(env.baseURL, { waitUntil: 'domcontentloaded' })
      await page.locator('.home-primary').click()
      await expect(page).toHaveURL(/\/explore/)
      await page.locator('input[type="search"]').fill('青铜')
      await page.locator('.museum-search-field__submit').click()
      const result = page.locator('.gallery-result-card').first()
      await expect(result).toBeVisible()
      await result.click()
      await expect(page.locator('.detail-header')).toBeVisible()
      await page.locator('.back-link').click()
      await expect(page).toHaveURL(/\/explore/)
      await expect(page.locator('input[type="search"]')).toHaveValue('青铜')
      await page.locator('.museum-search-field__clear').click()
      await page.locator(width === 390 ? '.mobile-tab-bar a[href="/exhibits"]' : '.gallery-exhibit-link').click()
      await page.locator('a[href^="/exhibits/"]').first().click()
      await expect(page.locator('.immersive-exhibit')).toBeVisible()
    })
    await record(page, `${label}-search-loading-error-retry-empty`, async () => {
      await page.goto(`${env.baseURL}/explore`, { waitUntil: 'domcontentloaded' })
      let release
      const pending = new Promise(resolve => { release = resolve })
      await page.route('**/api/v1/search?*', async route => {
        await pending
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '验收模拟：搜索暂时不可用' }) })
      })
      const input = page.locator('input[type="search"]')
      const submit = page.locator('.museum-search-field__submit')
      await input.fill('青铜')
      await submit.click()
      await expect(input).toBeDisabled()
      await expect(page.locator('.museum-search-field__clear')).toBeDisabled()
      await page.screenshot({ path: resolve(output, `${label}-search-loading.png`) })
      release()
      await expect(page.locator('.museum-search-field__error')).toBeVisible()
      await page.screenshot({ path: resolve(output, `${label}-search-error.png`) })
      await page.unroute('**/api/v1/search?*')
      await page.locator('.collection-state--error button').click()
      await expect(page.locator('.gallery-result-card').first()).toBeVisible()
      await page.screenshot({ path: resolve(output, `${label}-search-success.png`) })
      await input.fill('不存在的藏品xyz987654321')
      await submit.click()
      await expect(page.locator('.collection-state--empty')).toBeVisible()
      await page.locator('.museum-search-field__clear').click()
      await expect(input).toHaveValue('')
      await expect(page.locator('#collection-search-results')).toHaveCount(0)
    })
    if (width === 390) await record(page, `${label}-cart-keyboard`, async () => {
      await page.goto(`${env.baseURL}/shop`, { waitUntil: 'domcontentloaded' })
      const trigger = page.locator('.mobile-cart-trigger')
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
      await page.screenshot({ path: resolve(output, `${label}-cart-focus.png`) })
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    })
    await context.close()
  }
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(theme => { localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', 'zh-CN') }, theme)
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    await record(page, `${theme}-shop-route-style-independence`, async () => {
      await page.goto(`${env.baseURL}/shop`, { waitUntil: 'domcontentloaded' })
      const empty = page.locator('.cart-panel .cart-empty-state')
      await expect(empty).toBeVisible()
      const appearance = () => empty.evaluate(el => {
        const s = getComputedStyle(el)
        return { background: s.backgroundColor, image: s.backgroundImage, border: s.borderColor }
      })
      const direct = await appearance()
      expect(direct.image).toBe('none')
      await page.screenshot({ path: resolve(output, `${theme}-shop-direct.png`) })
      await page.locator('.site-header nav a[href="/explore"]').click()
      await expect(page.locator('.gallery-intro')).toBeVisible()
      await page.locator('.site-header nav a[href="/shop"]').click()
      await expect(empty).toBeVisible()
      expect(await appearance()).toEqual(direct)
    })
    await context.close()
  }
  const login = await fetch(`${env.baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
  if (!login.ok) throw new Error(`Local admin login ${login.status}`)
  const token = (await login.json()).data.accessToken
  const context = await browser.newContext()
  await context.addInitScript(token => localStorage.setItem('heluo.access-token', token), token)
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  await record(page, 'admin-combobox-popup-reference', async () => {
    await page.goto(`${env.baseURL}/admin`, { waitUntil: 'domcontentloaded' })
    const combo = page.locator('.el-select [role="combobox"]').first()
    await page.locator('.el-select__wrapper').first().click()
    await expect(combo).toHaveAttribute('aria-expanded', 'true')
    const id = await combo.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    await expect(page.locator(`[id="${id}"]`)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(combo).toHaveAttribute('aria-expanded', 'false')
  })
  await context.close()
} finally { await browser.close() }
console.log(JSON.stringify(results, null, 2))
if (results.some(row => !row.passed)) process.exitCode = 1
