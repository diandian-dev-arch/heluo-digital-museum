import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const base = process.env.EXPLORE_CHECK_URL ?? 'http://127.0.0.1:4189'
const out = process.env.EXPLORE_CHECK_OUT ?? '../artifacts/explore-discovery-header-20260912'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const width of [320, 390, 768, 1024, 1366, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    // Enter through the real public navigation on both desktop and mobile.
    const entry = page.locator('a[href="/explore"]').filter({ visible: true }).first()
    await entry.click()
    await page.locator('.gallery-object').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    const input = page.locator('.gallery-search input')
    const submit = page.locator('.gallery-search .museum-search-field__submit')
    const control = page.locator('.gallery-search .museum-search-field__control')
    await page.mouse.move(0, 0)
    await page.waitForTimeout(180)
    const state = await page.evaluate(() => {
      const inspect = selector => {
        const e = document.querySelector(selector), s = getComputedStyle(e), r = e.getBoundingClientRect()
        return { width: r.width, height: r.height, x: r.x, y: r.y, bg: s.backgroundColor, image: s.backgroundImage, shadow: s.boxShadow, border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], borderColor: s.borderColor, radius: s.borderRadius, font: s.fontSize, line: s.lineHeight, weight: s.fontWeight, gap: s.gap, marginTop: s.marginTop, padding: s.padding, color: s.color, direction: s.flexDirection, filter: s.backdropFilter }
      }
      return { overflow: document.documentElement.scrollWidth > innerWidth, header: inspect('.gallery-intro'), copy: inspect('.gallery-intro__copy'), title: inspect('.gallery-intro h1'), description: inspect('.gallery-intro__description'), search: inspect('.gallery-search .museum-search-field__control'), icon: inspect('.museum-search-field__leading'), iconSvg: inspect('.museum-search-field__leading svg'), button: inspect('.museum-search-field__submit') }
    })
    assert.equal(state.overflow, false)
    assert.deepEqual(state.header.border, ['0px', '0px', '1px', '0px'])
    assert.equal(state.header.shadow, 'none'); assert.equal(state.header.image, 'none')
    assert.equal(state.header.bg, 'rgba(0, 0, 0, 0)')
    assert.equal(state.title.font, '30px'); assert.equal(state.title.weight, '600')
    assert.equal(state.description.font, '14px'); assert.equal(state.description.marginTop, '8px')
    assert.equal(state.search.height, 46); assert.equal(state.search.radius, '10px')
    assert.equal(state.search.shadow, 'none'); assert.equal(state.search.image, 'none'); assert.equal(state.search.filter, 'none')
    assert.equal(state.button.height, 36); assert.equal(state.button.radius, '7px')
    assert.equal(state.button.y - state.search.y, 5)
    if (theme === 'dark') {
      const bronze = await page.locator('.gallery-filters button.active').evaluate(el => getComputedStyle(el, '::after').backgroundColor)
      assert.equal(state.button.bg, bronze); assert.equal(state.button.color, 'rgb(36, 31, 24)')
    } else {
      assert.equal(state.button.bg, 'rgb(14, 98, 72)'); assert.equal(state.button.color, 'rgb(255, 255, 255)')
    }
    assert.deepEqual(state.icon.border, ['0px', '0px', '0px', '0px'])
    assert.equal(state.icon.width, 18); assert.equal(state.icon.height, 18); assert.equal(state.iconSvg.width, 18)
    assert.deepEqual(await input.evaluate(el => {
      const s = getComputedStyle(el)
      return [s.backgroundColor, s.backgroundImage, s.borderRadius, s.color, getComputedStyle(el, '::placeholder').color]
    }), ['rgba(0, 0, 0, 0)', 'none', '0px', theme === 'light' ? 'rgb(38, 61, 53)' : 'rgb(231, 238, 233)', theme === 'light' ? 'rgb(83, 100, 92)' : 'rgb(137, 153, 144)'])
    if (width > 768) {
      assert.equal(state.header.direction, 'row')
      assert(state.search.width >= 380 && state.search.width <= 420)
      assert(Math.abs(state.copy.y + state.copy.height / 2 - state.search.y - 23) < 1)
      if (locale === 'zh-CN') assert(state.header.height >= 108 && state.header.height <= 124)
    } else {
      assert.equal(state.header.direction, 'column'); assert.equal(state.header.gap, '18px')
      assert.equal(state.search.width, state.header.width)
    }
    await page.screenshot({ path: `${out}/${width}-${theme}-${locale}.png` })
    await control.hover(); await page.waitForTimeout(180)
    const hover = await control.evaluate(el => ({ border: getComputedStyle(el).borderColor, bg: getComputedStyle(el).backgroundColor }))
    assert.notEqual(hover.border, state.search.borderColor)
    await input.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(180)
    const focus = await control.evaluate(el => getComputedStyle(el).boxShadow)
    assert(focus.includes('3px'))
    assert.deepEqual(await control.evaluate(el => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineOffset] }), ['solid', '2px', '2px'])
    await page.keyboard.press('Tab')
    assert(await submit.evaluate(el => el === document.activeElement && el.matches(':focus-visible') && getComputedStyle(el).outlineWidth === '2px'))
    await submit.hover(); await page.waitForTimeout(180)
    const buttonHover = await submit.evaluate(el => getComputedStyle(el).backgroundColor)
    assert.notEqual(buttonHover, state.button.bg)
    await page.mouse.down(); await page.waitForTimeout(180)
    const active = await submit.evaluate(el => getComputedStyle(el).backgroundColor)
    assert.notEqual(active, buttonHover)
    const contrast = await submit.evaluate((el, backgrounds) => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
      const luminance = color => {
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
        const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { const x = v / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 })
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
      }
      const text = luminance(getComputedStyle(el).color)
      return backgrounds.map(bg => { const l = luminance(bg); return (Math.max(l, text) + .05) / (Math.min(l, text) + .05) })
    }, [state.button.bg, buttonHover, active])
    assert(contrast.every(value => value >= 4.5), `Button contrast: ${contrast}`)
    await page.mouse.up()
    const initialUrl = page.url()
    await input.fill('   '); await input.press('Enter')
    assert.equal(page.url(), initialUrl)
    await input.fill('青铜'); await input.press('Enter')
    await page.locator('.gallery-result-card').first().waitFor()
    assert.equal(new URL(page.url()).searchParams.get('q'), '青铜')
    const resultCount = await page.locator('.gallery-result-card').count()
    const resultUrl = page.url()
    await input.fill(''); await submit.click()
    assert.equal(page.url(), resultUrl)
    assert.equal(await page.locator('.gallery-result-card').count(), resultCount)
    await input.fill('青铜')
    await page.locator('.museum-search-field__clear').click()
    await page.locator('.gallery-object').first().waitFor()
    await page.locator('.gallery-filters button').nth(2).click()
    await page.waitForURL('**category=JADE'); await page.locator('.gallery-object').first().waitFor()
    const categoryUrl = page.url()
    await input.fill(' '); await submit.click(); assert.equal(page.url(), categoryUrl)
    await input.fill('青铜'); await submit.click()
    await page.locator('.gallery-result-card').first().waitFor()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.gallery-result-card').first().waitFor()
    assert.equal(await input.inputValue(), '青铜')
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.locator('.gallery-object').first().waitFor()
    assert.equal(page.url(), categoryUrl)
    assert.deepEqual(errors, [])
    results.push({ width, theme, locale, state, hover, focus, buttonHover, active, contrast, resultCount, passed: true })
    console.log(`${width} ${theme} ${locale}: passed`)
    await page.close()
  }
  const feedback = []
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.addInitScript(theme => localStorage.setItem('heluo.theme', theme), theme)
    await page.goto(`${base}/explore`, { waitUntil: 'domcontentloaded' })
    await page.locator('.gallery-object').first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    const input = page.locator('.gallery-search input'), submit = page.locator('.museum-search-field__submit')
    await input.fill('青铜')
    const before = await page.locator('.gallery-intro').boundingBox()
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route('**/api/v1/search?**', async route => { await gate; await route.continue() })
    await submit.click()
    await page.locator('.gallery-search[data-state="loading"]').waitFor()
    assert(await input.isDisabled()); assert(await submit.isDisabled())
    assert(await page.locator('.museum-search-field__clear').isDisabled())
    assert.deepEqual(await page.locator('.gallery-intro').boundingBox(), before)
    release()
    await page.locator('.gallery-result-card').first().waitFor()
    assert.deepEqual(await page.locator('.gallery-intro').boundingBox(), before)
    await page.unroute('**/api/v1/search?**')
    await page.route('**/api/v1/search?**', route => route.abort('failed'))
    await input.fill('玉'); await submit.click()
    await page.locator('.gallery-search[data-state="error"]').waitFor()
    assert.equal(await input.getAttribute('aria-invalid'), 'true')
    assert(await page.locator('.museum-search-field__error').isVisible())
    await page.unroute('**/api/v1/search?**')
    await page.locator('.gallery-state button').click()
    await page.locator('.gallery-result-card').first().waitFor()
    await input.fill('zzzz-no-museum-result-947'); await input.press('Enter')
    await page.locator('.gallery-results .collection-state--empty').waitFor()
    await page.locator('.gallery-results .collection-state--empty button').click()
    await page.locator('.gallery-object').first().waitFor()
    feedback.push({ width, theme, loadingDisabled: true, headerStable: true, errorRecovery: true, emptyRecovery: true })
    await page.close()
  }
  await writeFile(`${out}/summary.json`, JSON.stringify({ passed: true, results, feedback }, null, 2))
  console.log(JSON.stringify({ passed: true, states: results.length, out }))
} finally { await browser.close() }
