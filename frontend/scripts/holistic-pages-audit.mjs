import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4192'
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('Local verification only')
const phase = process.argv.includes('--baseline') ? 'baseline' : 'current'
const output = resolve(`../artifacts/holistic/${phase}-${Date.now()}`)
const paths = (process.env.HELUO_AUDIT_PATHS ?? '/,/explore,/artifacts/heluo-bronze-ding,/appointment,/shop,/login').split(',')
const results = []
const errors = []
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: width === 390 ? 844 : 1000 }, hasTouch: width === 390, isMobile: width === 390, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
    }, { theme, locale })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push({ width, theme, locale, message: error.message }))
    for (const path of paths) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.locator('main h1').first().waitFor()
      if (path === '/') {
        const story = page.locator('.home-story')
        if (await story.count()) await expect(story).not.toHaveAttribute('aria-busy', 'true')
      }
      if (path === '/explore') await page.locator('.gallery-objects').waitFor()
      if (path === '/appointment') await page.locator('.appointment-dates').waitFor()
      await page.evaluate(() => document.fonts.ready)
      for (const image of await page.locator('main img').all()) {
        if (!await image.isVisible()) continue
        await image.scrollIntoViewIfNeeded()
        await expect.poll(() => image.evaluate(el => el.complete)).toBe(true)
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      const metrics = await page.evaluate(() => {
        const visible = el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0
        const controls = [...document.querySelectorAll('main button,main input:not([type=hidden]),main select,main textarea,main a')].filter(visible)
        return {
          overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          smallControls: controls.filter(el => !['checkbox', 'radio'].includes(el.type)).flatMap(el => {
            const box = el.getBoundingClientRect()
            return box.width < 43.5 || box.height < 43.5 ? [{ name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 60), tag: el.tagName, width: box.width, height: box.height }] : []
          }),
          brokenImages: [...document.querySelectorAll('main img')].filter(visible).filter(el => !el.naturalWidth).map(el => el.getAttribute('src')),
          materials: ['.corridor-home__hero-cta', '.home-story', '.home-story h2', '.detail-source'].flatMap(selector => {
            const el = document.querySelector(selector)
            if (!el) return []
            const style = getComputedStyle(el)
            return [{ selector, color: style.color, background: style.backgroundColor, font: style.font }]
          }),
        }
      })
      const label = `${path.replaceAll('/', '_') || 'home'}-${width}-${theme}-${locale}`
      await page.screenshot({ path: resolve(output, `${label}.png`), fullPage: true })
      results.push({ path, width, theme, locale, ...metrics, screenshot: `${label}.png` })
    }
    await context.close()
    console.log(`${width}px ${theme} ${locale}: ${paths.length} pages captured`)
  }
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ phase, baseURL, generatedAt: new Date().toISOString(), results, errors, limitation: 'Automated Chromium screenshots; not physical-device, screen-reader or native zoom acceptance.' }, null, 2))
  console.log(JSON.stringify({ output, states: results.length, errors: errors.length, overflow: results.filter(x => x.overflow).length, brokenImages: results.filter(x => x.brokenImages.length).length, smallControlStates: results.filter(x => x.smallControls.length).length }))
}
if (errors.length || results.some(x => x.overflow || x.brokenImages.length)) process.exitCode = 1
