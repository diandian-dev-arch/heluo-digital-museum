import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:5176'
const output = resolve('../artifacts/visual-refinement-2026-09-08')
const routes = [
  { name: 'explore', ready: '.gallery-objects' },
  { name: 'appointment', ready: '.appointment-dates' },
]
const results = []
const pageErrors = []
let passed = false
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  for (const width of [320, 390, 760, 900, 1440, 1920]) {
    for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 1000 }, hasTouch: width < 761, isMobile: width < 761, deviceScaleFactor: 1, reducedMotion: 'reduce' })
      await context.addInitScript(({ theme, locale }) => {
        localStorage.setItem('heluo.theme', theme)
        localStorage.setItem('heluo.locale', locale)
      }, { theme, locale })
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(error.message))
      for (const route of routes) {
        await page.goto(`/${route.name}`, { waitUntil: 'domcontentloaded' })
        await page.locator(route.ready).waitFor()
        await page.evaluate(() => document.fonts.ready)
        // Scroll through lazy media as a visitor would before capturing the full page.
        for (const image of await page.locator('main img').all()) {
          await image.scrollIntoViewIfNeeded()
          await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true)
          await image.evaluate(element => element.decode())
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const metrics = await page.evaluate(() => {
          const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getBoundingClientRect().width > 0
          const name = element => element.getAttribute('aria-label') || element.textContent.trim().slice(0, 100)
          const controls = [...document.querySelectorAll('main button, main input, main textarea')].filter(visible)
          const text = [...document.querySelectorAll('main h1, main h2, main h3, main button, main label, .gallery-themes__copy')]
            .filter(visible).filter(element => getComputedStyle(element).clipPath !== 'inset(50%)')
          return {
            overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            smallControls: controls.filter(element => !['checkbox', 'radio'].includes(element.type)).flatMap(element => {
              const box = element.getBoundingClientRect()
              return box.width < 43.5 || box.height < 43.5 ? [{ name: name(element), width: box.width, height: box.height }] : []
            }),
            clippedText: text.filter(element => {
              const label = element.querySelector('.fluid-button__label')
              if (!label) return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
              const content = label.getBoundingClientRect()
              const control = element.getBoundingClientRect()
              return content.left < control.left - 1 || content.right > control.right + 1 || content.top < control.top - 1 || content.bottom > control.bottom + 1
            }).map(name),
            brokenImages: [...document.querySelectorAll('main img')].filter(visible).filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')),
            h1Font: getComputedStyle(document.querySelector('h1')).font,
          }
        })
        const label = `${route.name}-${width}-${theme}-${locale}`
        results.push({ label, ...metrics })
        await page.screenshot({ path: resolve(output, `${label}.png`), fullPage: true })
        assert.equal(metrics.overflow, 0, `${label}: horizontal overflow`)
        assert.deepEqual(metrics.smallControls, [], `${label}: small controls`)
        assert.deepEqual(metrics.clippedText, [], `${label}: clipped text`)
        assert.deepEqual(metrics.brokenImages, [], `${label}: broken images`)

        if (route.name === 'appointment' && width === 390) {
          await page.locator('.appointment-day:not(:disabled)').first().tap()
          await page.locator('.appointment-mobile-action button').tap()
          const sheet = page.locator('.appointment-refined-sheet')
          await expect(sheet).toBeVisible()
          const contact = sheet.locator('input[autocomplete="name"]')
          await contact.fill('Visual verification')
          await expect(contact).toHaveValue('Visual verification')
          await page.screenshot({ path: resolve(output, `appointment-sheet-${theme}-${locale}.png`) })
          await sheet.locator('.bottom-sheet-close').click()
          await expect(sheet).toHaveCount(0)
        }
      }
      await context.close()
    }
    console.log(`${width}px: both routes, themes and languages passed`)
  }
  assert.deepEqual(pageErrors, [])
  passed = true
  console.log(`Passed ${results.length} visual states; no page errors.`)
} finally {
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ baseURL, generatedAt: new Date().toISOString(), passed, results, pageErrors }, null, 2))
  await browser.close()
}
