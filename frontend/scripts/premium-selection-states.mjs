import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4199'
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const env = JSON.parse(await readFile(process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/docker-environment.json', 'utf8'))
const login = await fetch(`${baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert.equal(login.status, 200)
const token = (await login.json()).data.accessToken
const output = resolve('../artifacts/premium-visual-2026-09-10/selection-states')
await mkdir(output, { recursive: true })
const report = { complete: false, baseURL, buildSignature: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    if (process.argv[2] && process.argv[2] !== `${width}-${theme}-${locale}`) continue
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale, token }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
      localStorage.setItem('heluo.access-token', token)
    }, { theme, locale, token })
    const page = await context.newPage()
    const label = `${width}-${theme}-${locale}`
    const result = { label, checks: [], appearances: [] }
    // This is a read-only interaction audit. No booking, cart or admin mutation.
    await page.route('**/api/v1/**', async route => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) throw new Error(`Unexpected mutation: ${route.request().method()} ${route.request().url()}`)
      await route.continue()
    })
    const appearance = async (name, locator) => {
      await locator.scrollIntoViewIfNeeded()
      await page.waitForTimeout(350)
      const state = await locator.evaluate(el => {
        const s = getComputedStyle(el), after = getComputedStyle(el, '::after'), r = el.getBoundingClientRect()
        const backgroundRules = []
        const visit = rules => { for (const rule of rules) {
          if (rule.media && !matchMedia(rule.conditionText).matches) continue
          if (rule.selectorText && /background/.test(rule.style?.cssText || '') && el.matches(rule.selectorText)) backgroundRules.push({ selector: rule.selectorText, style: rule.style.cssText })
          if (rule.cssRules) visit(rule.cssRules)
        } }
        for (const sheet of document.styleSheets) { try { visit(sheet.cssRules) } catch {} }
        return { text: el.textContent.trim(), selected: el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed'), width: r.width, height: r.height, color: s.color, background: s.backgroundColor, backgroundImage: s.backgroundImage, backgroundRules, decoration: s.textDecorationLine, after: { content: after.content, display: after.display, opacity: after.opacity, height: after.height }, focus: el === document.activeElement, outline: s.outline }
      })
      result.appearances.push({ name, ...state })
      assert.ok(state.width >= 44 && state.height >= 44, `${name} needs a 44px target`)
      if (name === 'shop-category' || name.endsWith('-tab')) assert.equal(state.decoration, 'underline', `${name} needs a non-color selected marker`)
      if (name.endsWith('-tab')) {
        assert.equal(state.backgroundImage, 'none', 'A legacy hover gradient must not replace the selected tab face')
        assert.notEqual(state.background, 'rgba(0, 0, 0, 0)', 'Selected tabs need their own solid face')
      }
    }
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
    const story = page.locator('.home-closeup__copy a')
    await expect(story).toHaveAttribute('href', '/artifacts/heluo-bronze-ding')
    await story.scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(output, `${label}-story.png`) })
    await story.click()
    await expect(page.locator('h1')).toHaveText('河洛青铜鼎（数字重制）')
    const source = page.locator('.detail-content a[href="https://www.clevelandart.org/art/1962.281"]')
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(page.locator('.detail-content')).toContainText('三个观察点')
    await source.scrollIntoViewIfNeeded()
    assert.ok(await source.evaluate(el => [...el.getClientRects()].every(r => r.left >= 0 && r.right <= innerWidth)))
    await page.screenshot({ path: resolve(output, `${label}-source.png`) })
    await page.locator('.related-exhibit').click()
    await expect(page.locator('.immersive-exhibit')).toBeVisible()
    if (width === 390) {
      await page.locator('.viewer-poster-start, .mobile-exhibit-info-trigger').filter({ visible: true }).first().waitFor({ timeout: 60000 })
      if (await page.locator('.viewer-poster-start').isVisible()) await page.locator('.viewer-poster-start').click()
      await page.locator('.mobile-exhibit-info-trigger').waitFor({ state: 'visible', timeout: 60000 })
      await page.locator('.mobile-exhibit-info-trigger').click()
    }
    await page.locator('.exhibit-panel-actions a[href="/artifacts/heluo-bronze-ding"]').filter({ visible: true }).first().click()
    await expect(page.locator('h1')).toHaveText('河洛青铜鼎（数字重制）')
    result.checks.push('home-story-source-3d-return')

    await page.goto(`${baseURL}/explore`, { waitUntil: 'domcontentloaded' })
    const category = page.locator('.gallery-filters button').nth(1)
    await category.focus()
    await page.keyboard.press('Enter')
    await expect(category).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.gallery-filters [aria-pressed="true"]')).toHaveCount(1)
    await appearance('collection-category', category)
    result.checks.push('collection-category-keyboard')

    await page.goto(`${baseURL}/shop`, { waitUntil: 'domcontentloaded' })
    const shopCategory = page.locator('.shop-category-nav button').nth(2)
    await shopCategory.focus()
    await page.keyboard.press('Space')
    await expect(shopCategory).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.shop-category-nav [aria-pressed="true"]')).toHaveCount(1)
    await appearance('shop-category', shopCategory)
    await page.screenshot({ path: resolve(output, `${label}-shop-selected.png`) })
    result.checks.push('shop-category-keyboard')

    await page.goto(`${baseURL}/appointment`, { waitUntil: 'domcontentloaded' })
    const day = page.locator('.appointment-day:not(:disabled)').first()
    await day.focus(); await page.keyboard.press('Enter')
    await expect(day).toHaveAttribute('aria-pressed', 'true')
    await expect(day.locator('.appointment-day__check')).toBeVisible()
    const time = page.locator('.appointment-time:not(:disabled)').first()
    await time.focus(); await page.keyboard.press('Space')
    await expect(time).toHaveAttribute('aria-pressed', 'true')
    await expect(time.locator('.appointment-time__radio svg')).toBeVisible()
    await appearance('appointment-date', day)
    await appearance('appointment-time', time)
    if (width === 390) {
      const trigger = page.locator('.appointment-mobile-action .fluid-button')
      await trigger.click()
      const dialog = page.locator('.appointment-bottom-sheet')
      await expect(dialog).toBeVisible()
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(i === 0 ? 'Shift+Tab' : 'Tab')
        assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus must stay in booking sheet')
      }
      await dialog.locator('textarea').focus()
      await page.screenshot({ path: resolve(output, `${label}-appointment-nested-focus.png`) })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(trigger).toBeFocused()
      result.checks.push('appointment-nested-scroll-focus-restoration')
    }
    result.checks.push('appointment-date-time-keyboard-and-checkmarks')

    for (const path of ['/admin', '/admin/operations']) {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      const tabs = page.getByRole('tab')
      await tabs.first().focus(); await page.keyboard.press('End')
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
      await expect(tabs.last()).toBeFocused()
      await page.keyboard.press('Home')
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('ArrowRight')
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { selected: true })).toHaveCount(1)
      await appearance(`${path}-tab`, tabs.nth(1))
      await page.screenshot({ path: resolve(output, `${label}${path.replaceAll('/', '-')}-selected.png`) })
      result.checks.push(`${path}-tab-home-end-arrows`)
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    report.results.push(result)
    await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
    console.log(`${label}: ${result.checks.length} passed`)
    await context.close()
  }
  report.complete = true
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify({ states: report.results.length, checks: report.results.reduce((n, r) => n + r.checks.length, 0), complete: report.complete }))
