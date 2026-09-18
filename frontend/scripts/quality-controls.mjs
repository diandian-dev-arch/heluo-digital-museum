import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const output = resolve(process.env.HELUO_AUDIT_OUTPUT ?? '../artifacts/sitewide-quality/controls')
const env = JSON.parse(await readFile(process.env.HELUO_ENVIRONMENT_FILE ?? resolve(output, '../current-environment.json'), 'utf8'))
env.baseURL = process.env.HELUO_BASE_URL ?? env.baseURL
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const entryResponse = await fetch(env.baseURL)
if (!entryResponse.ok) throw new Error(`Entry HTTP ${entryResponse.status}`)
const buildSignature = createHash('sha256').update(await entryResponse.text()).digest('hex')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
const results = []
const routes = ['/', '/explore', '/appointment', '/login', '/exhibits/heluo-bronze-ding-3d']
const scenarios = [
  { width: 320, mode: 'narrow' }, { width: 768, mode: 'tablet' }, { width: 1920, mode: 'wide' },
  { width: 1440, mode: 'zoom', zoom: 2 }, { width: 390, mode: 'forced', forcedColors: 'active' },
]
try {
  for (const scenario of scenarios) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 1000 }, reducedMotion: 'reduce', forcedColors: scenario.forcedColors ?? 'none' })
    await context.addInitScript(({ theme, zoom }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', 'en-US')
      if (zoom) document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(zoom) })
    }, { theme, zoom: scenario.zoom })
    const page = await context.newPage()
    for (const path of routes) {
      await page.goto(`${env.baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      await page.locator('h1').first().waitFor({ state: 'attached' })
      await page.waitForTimeout(200)
      const metrics = await page.evaluate(() => {
        const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getBoundingClientRect().width > 0
        const name = element => element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title') || ''
        const controls = [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, .site-utilities a')].filter(visible)
        const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          unnamed: controls.filter(element => element.tagName === 'BUTTON' && !name(element)).map(element => element.outerHTML.slice(0, 200)),
          smallControls: controls.filter(element => !['checkbox', 'radio'].includes(element.type)).flatMap(element => {
            const box = element.getBoundingClientRect()
            return box.width / zoom < 43.5 || box.height / zoom < 43.5 ? [{ name: name(element).slice(0, 80), class: element.className, width: box.width / zoom, height: box.height / zoom }] : []
          }),
          materials: ['body', '.site-header', '.auth-panel', '.collection-discovery', '.museum-search-field__control', '.fluid-button'].flatMap(selector => {
            const element = document.querySelector(selector)
            if (!element) return []
            const style = getComputedStyle(element)
            return [{ selector, color: style.color, background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius, shadow: style.boxShadow }]
          }),
        }
      })
      await page.keyboard.press('Tab')
      const focus = await page.evaluate(() => {
        const active = document.activeElement
        const style = getComputedStyle(active)
        return { tag: active?.tagName, name: active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 80), outline: style.outlineStyle, width: style.outlineWidth }
      })
      const file = `${path === '/' ? 'home' : path.split('/').at(-1)}-${scenario.mode}-${theme}.png`
      await page.screenshot({ path: resolve(output, file), fullPage: true })
      results.push({ path, ...scenario, theme, ...metrics, focus, screenshot: file })
    }
    await context.close()
    console.log(`${scenario.mode} ${theme} checked`)
  }
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ timestamp: new Date().toISOString(), baseURL: env.baseURL, buildSignature, complete: results.length === 50, zoomMethod: 'CSS zoom 2; native OS/browser zoom remains separate manual verification', results }, null, 2))
}
const summary = { states: results.length, overflow: results.filter(row => row.overflow > 1).length, unnamed: results.filter(row => row.unnamed.length).length, smallControls: results.filter(row => row.smallControls.length).length }
console.log(JSON.stringify(summary))
if (summary.overflow || summary.unnamed) process.exitCode = 1
