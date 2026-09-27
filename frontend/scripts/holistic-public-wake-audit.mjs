import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const baseURL = 'https://heluo.pocketbay.app/'
const output = resolve('../artifacts/holistic', `public-wake-${Date.now()}`)
await mkdir(output, { recursive: true })
const evidence = { timestamp: new Date().toISOString(), baseURL, action: 'One public visitor wake button click; no deployment or business writes.', clicked: false, observations: [] }
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20000 })
  const wake = page.getByRole('button', { name: '唤醒并继续', exact: true })
  if (await wake.isVisible()) {
    await wake.click()
    evidence.clicked = true
  }
  const started = Date.now()
  for (let sample = 0; sample < 5; sample++) {
    const observation = { elapsedMs: Date.now() - started, bodyText: (await page.locator('body').innerText()).slice(0, 2000),
      frames: page.frames().map(frame => frame.url()) }
    evidence.observations.push(observation)
    console.log(JSON.stringify(observation))
    if (page.frames().length > 1 || /探索馆藏/.test(observation.bodyText)) break
    if (sample < 4) await page.waitForTimeout(15000)
  }
  await page.screenshot({ path: resolve(output, 'wake-result.png') })
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, clicked: evidence.clicked }))
}
