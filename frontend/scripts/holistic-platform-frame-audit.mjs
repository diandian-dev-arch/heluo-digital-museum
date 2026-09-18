import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const output = resolve('../artifacts/holistic', `platform-frame-${Date.now()}`)
await mkdir(output, { recursive: true })
const evidence = { timestamp: new Date().toISOString(), errors: [], observations: [], navigation: [] }
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.on('pageerror', error => evidence.errors.push(error.message))
  page.on('requestfailed', request => evidence.errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.goto('https://heluo.pocketbay.app/', { waitUntil: 'domcontentloaded', timeout: 20000 })
  let app
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000)
    const frames = await Promise.all(page.frames().map(async frame => ({ url: frame.url(),
      text: (await frame.locator('body').innerText({ timeout: 2000 }).catch(() => '')).slice(0, 2000) })))
    evidence.observations.push({ at: new Date().toISOString(), frames })
    app = page.frames().find(frame => frame.url().startsWith('https://heluo--e.pocketbay.app/'))
    if (app && await app.locator('a[href="/explore"]').first().isVisible()) break
  }
  await page.screenshot({ path: resolve(output, 'home.png') })
  if (app && await app.locator('a[href="/explore"]').first().isVisible()) {
    await app.locator('a[href="/explore"]').first().click()
    await app.waitForURL('**/explore', { timeout: 15000 })
    evidence.navigation.push({ action: 'home-to-explore', outerURL: page.url(), innerURL: app.url() })
    await page.screenshot({ path: resolve(output, 'explore.png') })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    evidence.navigation.push({ action: 'outer-reload', outerURL: page.url(), innerURLs: page.frames().map(frame => frame.url()) })
  }
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, ...evidence }))
}
