import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Four read-only public probes and one unauthenticated page visit. No wake/deploy/admin actions.
const baseURL = 'https://heluo.pocketbay.app'
const output = resolve('../artifacts/holistic', `public-entry-${Date.now()}`)
await mkdir(output, { recursive: true })
const evidence = { timestamp: new Date().toISOString(), baseURL, requests: [], browser: {}, applicationVerified: false }
for (const path of ['/', '/api/v1/health', '/api/v1/ready', '/api/v1/categories']) {
  const started = Date.now()
  try {
    const response = await fetch(`${baseURL}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const content = Buffer.from(await response.arrayBuffer())
    evidence.requests.push({ path, status: response.status, bytes: content.length, elapsedMs: Date.now() - started,
      contentType: response.headers.get('content-type'), server: response.headers.get('server'),
      sha256: createHash('sha256').update(content).digest('hex') })
  } catch (error) { evidence.requests.push({ path, error: error.message, elapsedMs: Date.now() - started }) }
}
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20000 })
    evidence.browser.status = response?.status()
  } catch (error) { evidence.browser.navigationError = error.message }
  evidence.browser.url = page.url()
  evidence.browser.title = await page.title()
  evidence.browser.bodyText = (await page.locator('body').innerText()).slice(0, 2000)
  evidence.browser.frames = page.frames().map(frame => frame.url())
  await page.screenshot({ path: resolve(output, 'public-entry.png') })
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, ...evidence }))
}
