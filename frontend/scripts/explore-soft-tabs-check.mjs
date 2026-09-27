import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const base = process.env.EXPLORE_CHECK_URL ?? 'http://127.0.0.1:4189'
const out = process.env.EXPLORE_CHECK_OUTPUT ?? '../artifacts/explore-soft-tabs-20260912'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    await page.goto(`${base}/explore`, { waitUntil: 'domcontentloaded' })
    const buttons = page.locator('.gallery-filters button')
    await buttons.nth(3).waitFor()
    await page.locator('.gallery-object').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    const initialCount = await page.locator('.gallery-object').count()
    await buttons.nth(1).hover()
    await page.waitForTimeout(200)
    const hover = await buttons.nth(1).evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow }))
    assert.notEqual(hover.bg, 'rgba(0, 0, 0, 0)')
    assert.equal(hover.shadow, 'none')
    await page.mouse.move(0, 0)
    for (const [index, category] of [[1, 'BRONZE'], [2, 'JADE'], [3, 'RIVER']]) {
      await buttons.nth(index).click()
      await page.waitForURL(`**category=${category}`)
      await page.locator('.gallery-object').first().waitFor()
      assert.equal(await buttons.nth(index).getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('.gallery-filters [aria-pressed="true"]').count(), 1)
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.gallery-object').first().waitFor()
    assert.equal(await buttons.nth(3).getAttribute('aria-pressed'), 'true')
    // Focus starts on the final item; reverse tabbing must reveal previous offscreen items.
    await buttons.nth(3).focus()
    await page.keyboard.press('Shift+Tab')
    assert(await buttons.nth(2).evaluate(el => el === document.activeElement && el.matches(':focus-visible')))
    const focus = await buttons.nth(2).evaluate(el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect()
      return { style: s.outlineStyle, width: s.outlineWidth, visible: r.left >= p.left && r.right <= p.right }
    })
    assert.equal(focus.style, 'solid')
    assert.equal(focus.width, '2px')
    assert(focus.visible)
    await page.keyboard.press('Enter')
    await page.waitForURL('**category=JADE')
    await page.locator('.gallery-object').first().waitFor()
    await buttons.first().click()
    await page.locator('.gallery-object').first().waitFor()
    assert.equal(await page.locator('.gallery-object').count(), initialCount)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)
    const state = await page.evaluate(() => {
      const nav = document.querySelector('.gallery-filters'), ns = getComputedStyle(nav)
      const buttons = [...nav.querySelectorAll('button')].map(el => {
        const s = getComputedStyle(el), r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after')
        return { height: r.height, top: r.top, bg: s.backgroundColor, image: s.backgroundImage, shadow: s.boxShadow, radius: s.borderRadius, border: s.borderRightColor, font: s.fontSize, line: [a.width, a.height, a.opacity] }
      })
      return { overflow: document.documentElement.scrollWidth > innerWidth, gap: ns.columnGap, navBg: ns.backgroundColor, navShadow: ns.boxShadow, buttons }
    })
    assert.equal(state.overflow, false)
    assert.equal(state.gap, width <= 760 ? '6px' : '8px')
    assert.equal(state.navBg, 'rgba(0, 0, 0, 0)')
    assert.equal(state.navShadow, 'none')
    for (const b of state.buttons) {
      assert.equal(b.height, width <= 760 ? 40 : 42)
      assert.equal(b.radius, '8px'); assert.equal(b.font, '14px')
      assert.equal(b.shadow, 'none'); assert.equal(b.image, 'none')
      assert.equal(b.border, 'rgba(0, 0, 0, 0)')
    }
    assert.equal(state.buttons[1].bg, 'rgba(0, 0, 0, 0)')
    assert.deepEqual(state.buttons[0].line, ['24px', '2px', '1'])
    if (width <= 760) assert(state.buttons.every(b => b.top === state.buttons[0].top))
    await page.screenshot({ path: `${out}/${width}-${theme}-${locale}.png` })
    await page.locator('.gallery-search input').fill('青铜')
    await page.locator('.gallery-search input').press('Enter')
    await page.locator('.gallery-result-card').first().waitFor()
    assert((await page.locator('.gallery-result-card').count()) > 0)
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await buttons.first().waitFor()
    assert.deepEqual(errors, [])
    results.push({ width, theme, locale, hover, focus, ...state, passed: true })
    await page.close()
  }
  await writeFile(`${out}/summary.json`, JSON.stringify({ passed: true, results }, null, 2))
  console.log(JSON.stringify({ passed: true, states: results.length, out }))
} finally { await browser.close() }
