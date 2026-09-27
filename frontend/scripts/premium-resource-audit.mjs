import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const env = JSON.parse(await readFile('../artifacts/sitewide-quality/current-environment.json', 'utf8'))
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const output = resolve('../artifacts/premium-visual-2026-09-10/resources')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(theme => localStorage.setItem('heluo.theme', theme), theme)
    const page = await context.newPage()
    for (const path of ['/', '/explore', '/exhibits', '/shop']) {
      await page.goto(`${env.baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      await page.locator('h1').waitFor({ state: 'attached' })
      const images = await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
          scrollTo(0, y); await new Promise(resolve => setTimeout(resolve, 80))
        }
        await Promise.all([...document.images].map(img => img.decode().catch(() => {})))
        return [...document.images].map(img => {
          const style = getComputedStyle(img), rect = img.getBoundingClientRect()
          return { source: new URL(img.currentSrc || img.src).pathname, alt: img.alt,
            width: img.naturalWidth, height: img.naturalHeight, renderedWidth: rect.width,
            renderedHeight: rect.height, fit: style.objectFit, focalPosition: style.objectPosition,
            loading: img.loading, priority: img.fetchPriority, visible: img.checkVisibility() }
        })
      })
      results.push({ width, theme, path, images })
    }
    await context.close()
  }
} finally { await browser.close() }
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ scope: 'Selected responsive source and browser intrinsic dimensions at DPR 1; not a copyright verification or source-pixel measure for srcset.', results }, null, 2))
const failed = results.flatMap(row => row.images.filter(img => img.visible && (!img.width || !img.height)))
console.log(JSON.stringify({ states: results.length, broken: failed.length, home: results.filter(row => row.path === '/').map(row => ({ width: row.width, theme: row.theme, images: row.images })) }, null, 2))
if (failed.length) process.exitCode = 1
