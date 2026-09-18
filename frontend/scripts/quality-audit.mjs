import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const label = process.argv.includes('--baseline') ? 'baseline' : 'current'
const root = resolve(process.cwd(), '..', 'artifacts/sitewide-quality')
const env = JSON.parse(await readFile(resolve(root, `${label}-environment.json`), 'utf8'))
const evidenceRoot = process.env.HELUO_VISUAL_OUTPUT ? resolve(process.env.HELUO_VISUAL_OUTPUT) : root
const captureLabel = process.env.HELUO_VISUAL_LABEL ?? label
const output = resolve(evidenceRoot, `${captureLabel}-screenshots`)
await mkdir(output, { recursive: true })
async function api(path, body) {
  const response = await fetch(`${env.baseURL}/api/v1${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  const result = await response.json()
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return result.data
}
const [artifacts, articles, exhibits, admin] = await Promise.all([
  api('/artifacts?page=1&size=12'), api('/articles?page=1&size=12'), api('/exhibits'), api('/auth/login', env.admin),
])
const routes = [
  ['home', '/', '.corridor-home'], ['explore', '/explore', '.collection-discovery'],
  ['artifact', `/artifacts/${artifacts.items[0].slug}`, '.detail-page'], ['article', `/articles/${articles.items[0].slug}`, '.detail-page'],
  ['exhibits', '/exhibits', '.exhibits-intro'], ['exhibit', `/exhibits/${exhibits[0].slug}`, '.exhibit-detail-page, .exhibit-detail, .exhibit-experience'],
  ['appointment', '/appointment', '.appointment-page, .appointment-view, .visit-booking'], ['shop', '/shop', '#shop-products'],
  ['login', '/login', '.auth-page, .auth-panel'], ['reset', '/reset-password', '.auth-page, .auth-panel'],
  ['profile', '/profile', '.profile-page, .profile-records, .profile-hero'], ['admin', '/admin', '.admin-toolbar'],
  ['operations', '/admin/operations', '.admin-toolbar'], ['not-found', '/quality-missing-page', 'h1'],
]
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
const results = []
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale, token }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
      if (location.pathname.startsWith('/admin') || location.pathname === '/profile') localStorage.setItem('heluo.access-token', token)
      else localStorage.removeItem('heluo.access-token')
    }, { theme, locale, token: admin.accessToken })
    const page = await context.newPage()
    for (const [name, path] of routes) {
      const errors = []
      const capture = error => errors.push(error.message)
      page.on('pageerror', capture)
      await page.goto(`${env.baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      await page.locator('h1').first().waitFor({ state: 'attached', timeout: 25000 })
      await page.evaluate(async () => {
        for (let top = 0; top < document.documentElement.scrollHeight; top += window.innerHeight * .8) {
          window.scrollTo(0, top)
          await new Promise(resolveScroll => setTimeout(resolveScroll, 70))
        }
        await Promise.all([...document.images].map(img => img.decode().catch(() => {})))
        window.scrollTo(0, 0)
      })
      await page.evaluate(() => Promise.race([
        Promise.all([...document.images].filter(img => img.complete || img.loading !== 'lazy').map(img => img.decode().catch(() => {}))),
        new Promise(resolveImages => setTimeout(resolveImages, 3000)),
      ]))
      await page.waitForTimeout(name === 'exhibit' ? 1500 : 180)
      const metrics = await page.evaluate(() => ({
        title: document.title,
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        headings: [...document.querySelectorAll('h1')].map(el => el.textContent),
        brokenImages: [...document.images].filter(img => img.complete && !img.naturalWidth).map(img => img.currentSrc || img.src),
        pendingImages: [...document.images].filter(img => !img.complete).map(img => img.currentSrc || img.src),
        canvas: [...document.querySelectorAll('canvas')].map(el => ({ width: el.width, height: el.height })),
      }))
      const screenshot = `${name}-${width}-${theme}-${locale}.png`
      await page.screenshot({ path: resolve(output, screenshot), fullPage: true })
      results.push({ name, path, width, theme, locale, ...metrics, errors, screenshot })
      page.off('pageerror', capture)
    }
    await context.close()
    console.log(`${label}: ${width}px ${theme} ${locale} captured`)
  }
} finally {
  await writeFile(resolve(evidenceRoot, `${captureLabel}-visual-summary.json`), JSON.stringify({ timestamp: new Date().toISOString(), baseURL: env.baseURL, results }, null, 2))
  await browser.close()
}
console.log(`${results.length} page states; overflow=${results.filter(row => row.overflow > 1).length}; pageErrors=${results.filter(row => row.errors.length).length}`)
if (results.some(row => row.overflow > 1 || row.errors.length || row.brokenImages.length)) process.exitCode = 1
