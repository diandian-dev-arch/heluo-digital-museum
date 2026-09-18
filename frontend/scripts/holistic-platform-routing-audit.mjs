import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const origin = 'https://heluo.pocketbay.app'
const output = resolve('../artifacts/holistic', `platform-routing-${Date.now()}`)
await mkdir(output, { recursive: true })
const evidence = { timestamp: new Date().toISOString(), paths: [], resources: [] }
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const paths = process.argv.includes('--search-only') ? ['/explore?q=%E9%9D%92%E9%93%9C']
    : ['/explore?q=%E9%9D%92%E9%93%9C', '/exhibits/heluo-bronze-ding-3d', '/not-a-museum-route']
  for (const path of paths) {
    const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(4000)
    const item = { path, outerStatus: response?.status(), outerURL: page.url(),
      robots: await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null),
      frames: await Promise.all(page.frames().map(async frame => ({ url: frame.url(),
        title: await frame.title(), text: (await frame.locator('body').innerText({ timeout: 2000 }).catch(() => '')).slice(0, 1200) }))) }
    evidence.paths.push(item)
    if (path.includes('?q=')) {
      const app = page.frames().find(frame => frame.url().startsWith('https://heluo--e.pocketbay.app/'))
      assert.ok(app)
      const input = app.locator('input[type="search"]')
      await input.waitFor()
      item.searchValue = await input.inputValue()
      assert.equal(item.searchValue, '青铜')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(4000)
      const refreshed = page.frames().find(frame => frame.url().startsWith('https://heluo--e.pocketbay.app/'))
      assert.ok(refreshed)
      item.searchValueAfterReload = await refreshed.locator('input[type="search"]').inputValue()
      assert.equal(item.searchValueAfterReload, '青铜')
    }
    await page.screenshot({ path: resolve(output, `route-${evidence.paths.length}.png`) })
  }
  for (const path of ['/robots.txt', '/sitemap.xml']) {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10000) })
    const text = await response.text()
    evidence.resources.push({ path, status: response.status, contentType: response.headers.get('content-type'), text: text.slice(0, 2500) })
  }
  const response = await fetch(origin, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, signal: AbortSignal.timeout(10000) })
  const html = await response.text()
  // Store only public route-handling script, excluding transient shell handshake tokens and feedback data.
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1])
    .find(text => text.includes('function syncHash'))
  if (script) evidence.shellRouting = { sha256: createHash('sha256').update(script).digest('hex'), script }
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, paths: evidence.paths, resources: evidence.resources }))
}
