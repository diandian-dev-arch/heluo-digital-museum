import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4196'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
const output = resolve('../artifacts/holistic', `content-browser-${Date.now()}`)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
const evidence = { baseURL, timestamp: new Date().toISOString(), passed: false, paths: [], sourceLinks: [], mobile: null }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', locale: 'zh-CN' })
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  const story = page.locator('.home-closeup__copy a[href="/artifacts/heluo-bronze-ding"]')
  await story.waitFor()
  await story.click()
  await page.getByRole('heading', { level: 1, name: '河洛青铜鼎（数字重制）' }).waitFor()
  assert.match(await page.locator('.detail-content').innerText(), /clevelandart\.org/)
  const sourceLinks = page.locator('.detail-content a[href^="https://www.clevelandart.org/"]')
  assert.ok(await sourceLinks.count() > 0, 'The museum source must be an actual link, not only plain text.')
  evidence.sourceLinks = await sourceLinks.evaluateAll(links => links.map(link => ({
    href: link.href, target: link.target, rel: link.rel, text: link.textContent,
  })))
  for (const link of evidence.sourceLinks) {
    assert.ok(link.text?.trim(), 'Source links need readable labels.')
    if (link.target === '_blank') {
      assert.ok(link.rel.split(/\s+/).includes('noopener'))
      assert.ok(link.rel.split(/\s+/).includes('noreferrer'))
    }
  }
  evidence.paths.push(new URL(page.url()).pathname)
  await page.locator('.related-exhibit').click()
  await page.locator('.immersive-exhibit').waitFor()
  evidence.paths.push(new URL(page.url()).pathname)
  const related = page.locator('.exhibit-panel-actions a[href="/artifacts/heluo-bronze-ding"]').filter({ visible: true }).first()
  await related.click()
  await page.getByRole('heading', { level: 1, name: '河洛青铜鼎（数字重制）' }).waitFor()
  evidence.paths.push(new URL(page.url()).pathname)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { level: 1, name: '河洛青铜鼎（数字重制）' }).waitFor()
  assert.equal(await page.locator('a[href*="/artifacts/heluo-bronze-jue"]').count(), 0)
  await page.screenshot({ path: resolve(output, 'ding-return.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await sourceLinks.first().scrollIntoViewIfNeeded()
  evidence.mobile = await sourceLinks.first().evaluate(link => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    fragments: Array.from(link.getClientRects(), rect => ({ left: rect.left, right: rect.right })),
  }))
  assert.ok(evidence.mobile.documentWidth <= evidence.mobile.viewportWidth + 1, 'Source text must not cause horizontal page overflow.')
  assert.ok(evidence.mobile.fragments.length > 0, 'Source link must be rendered on mobile.')
  assert.ok(evidence.mobile.fragments.every(rect => rect.left >= -1 && rect.right <= evidence.mobile.viewportWidth + 1), 'Every wrapped source fragment must fit the mobile viewport.')
  await page.screenshot({ path: resolve(output, 'ding-source-mobile.png') })
  evidence.passed = true
} finally {
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  await browser.close()
  console.log(JSON.stringify({ output, ...evidence }))
}
