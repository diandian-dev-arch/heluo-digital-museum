import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base = 'http://127.0.0.1:4189'
const output = `../artifacts/premium-visual-2026-09-12/forced-focus-${Date.now()}`
await mkdir(output, { recursive: true })
const signature = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const start = await signature(), results = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, forcedColors: 'active', reducedMotion: 'reduce' })
    await context.addInitScript(theme => localStorage.setItem('heluo.theme', theme), theme)
    const page = await context.newPage()
    await page.goto(base + '/explore', { waitUntil: 'domcontentloaded' })
    const input = page.locator('.gallery-search input')
    await input.waitFor()
    await input.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const result = await input.evaluate(el => {
      const control = el.closest('.museum-search-field__control'), style = getComputedStyle(control)
      const probe = document.createElement('i'); probe.style.color = 'Highlight'; document.body.append(probe)
      const highlight = getComputedStyle(probe).color; probe.remove()
      return { forced: matchMedia('(forced-colors: active)').matches, focus: el.matches(':focus-visible'), outline: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor, highlight }
    })
    assert(result.forced && result.focus)
    assert.equal(result.outline, 'solid'); assert.equal(result.width, '2px'); assert.equal(result.offset, '2px'); assert.equal(result.color, result.highlight)
    const category = await page.locator('.gallery-filters button.active').evaluate(el => {
      const s = getComputedStyle(el), line = getComputedStyle(el, '::after')
      const probe = document.createElement('i'); probe.style.cssText = 'forced-color-adjust:none;color:HighlightText;background:Highlight'; document.body.append(probe)
      const expected = getComputedStyle(probe)
      const value = { text: el.textContent, adjust: s.forcedColorAdjust, color: s.color, background: s.backgroundColor, line: line.backgroundColor, expectedColor: expected.color, expectedBackground: expected.backgroundColor }
      probe.remove(); return value
    })
    assert(category.text.trim()); assert.equal(category.adjust, 'none'); assert.equal(category.color, category.expectedColor); assert.equal(category.background, category.expectedBackground); assert.equal(category.line, category.expectedColor)
    await page.screenshot({ path: `${output}/${theme}-${width}.png` })
    results.push({ theme, viewportWidth: width, ...result, category })
    await context.close()
  }
} finally {
  await browser.close()
  const end = await signature()
  await writeFile(`${output}/summary.json`, JSON.stringify({ complete: results.length === 4 && start === end, start, end, scope: 'Chromium forced-colors emulation, actual keyboard input focus and parent outline; not native Windows contrast theme or screen reader.', results }, null, 2))
}
console.log(JSON.stringify({ output, cases: results.length }))
