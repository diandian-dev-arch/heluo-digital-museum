import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:4189'
const output = `../artifacts/premium-visual-2026-09-12/native-zoom-tab-${Date.now()}`
const signature = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const start = await signature()
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/explore', '/appointment', '/shop', '/login', '/profile', '/admin', '/admin/operations']
const trialCss = process.env.HELUO_ZOOM_TRIAL_CSS || ''
const env = JSON.parse(await readFile('../artifacts/sitewide-quality/current-environment.json', 'utf8'))
const login = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert(login.ok)
const token = (await login.json()).data.accessToken
await mkdir(output, { recursive: true })
const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const results = [], blockedWrites = []
try {
  const settings = context.pages()[0]
  await settings.goto('chrome://settings/appearance')
  await settings.locator('#zoomLevel').selectOption('2')
  await context.route('**/api/**', route => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    blockedWrites.push(new URL(route.request().url()).pathname)
    return route.abort()
  })
  for (const theme of ['light', 'dark']) for (const path of paths) {
    const page = await context.newPage()
    await page.addInitScript(({ theme, token, path }) => {
      if (location.hostname !== '127.0.0.1') return
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', 'en-US')
      if (path.startsWith('/admin') || path === '/profile') localStorage.setItem('heluo.access-token', token)
      else localStorage.removeItem('heluo.access-token')
    }, { theme, token, path })
    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').first().waitFor({ state: 'attached' })
    await page.waitForTimeout(650)
    if (trialCss) await page.addStyleTag({ content: trialCss })
    assert.equal(await page.evaluate(() => innerWidth), 720)
    const steps = []
    for (let index = 0; index < 55; index++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(65)
      await page.evaluate(async () => {
        let previous = scrollY, stable = 0
        for (let frame = 0; frame < 30 && stable < 3; frame++) {
          await new Promise(resolve => requestAnimationFrame(resolve))
          const current = scrollY
          stable = Math.abs(current - previous) < .1 ? stable + 1 : 0
          previous = current
        }
      })
      const step = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return { body: true }
        const r = el.getBoundingClientRect()
        const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 3, r.y + 3], [r.right - 3, r.bottom - 3]]
        const hits = points.map(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y)))
        const hitElements = points.map(([x, y]) => {
          const hit = document.elementFromPoint(x, y)
          return hit && { tag: hit.tagName, class: hit.className, text: hit.textContent.trim().slice(0, 50), sameSelect: !!el.closest('.el-select') && el.closest('.el-select') === hit.closest('.el-select') }
        })
        return { tag: el.tagName, name: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent.trim().slice(0, 70), top: r.top, bottom: r.bottom, hits, hitElements, visible: el.matches(':focus-visible'), selector: el.id || el.className, scrollY }
      })
      steps.push(step)
      if (step.body && index > 0) break
      if (step.hits && !step.hits[0]) {
        await page.screenshot({ path: `${output}/${path.replaceAll('/', '-')}-${theme}-${index}.png` })
        const cdp = await context.newCDPSession(page)
        const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false })
        await writeFile(`${output}/${path.replaceAll('/', '-')}-${theme}-${index}-viewport.png`, Buffer.from(capture.data, 'base64'))
        await cdp.detach()
        if (step.tag === 'INPUT' && step.hitElements?.[0]?.sameSelect) {
          await page.keyboard.press('ArrowDown')
          await page.waitForTimeout(150)
          step.popup = await page.evaluate(() => {
            const el = document.activeElement
            const id = el?.getAttribute('aria-controls')
            const popup = id && document.getElementById(id)
            return { expanded: el?.getAttribute('aria-expanded'), exists: !!popup, options: popup?.querySelectorAll('[role=option]').length, active: el?.getAttribute('aria-activedescendant') }
          })
          await page.keyboard.press('Escape')
          step.focusReturned = await page.evaluate(() => document.activeElement?.matches('.el-select input'))
        }
      }
    }
    results.push({ path, theme, steps })
    await page.close()
  }
} finally {
  const end = await signature()
  await writeFile(`${output}/summary.json`, JSON.stringify({ complete: results.length === paths.length * 2 && start === end, start, end, trialCss, scope: 'Real Tab, default English routes at native Chrome 200%; max55 tabs per route, no control activation or business submission; hit-test failures require screenshot review.', results, blockedWrites }, null, 2))
  await context.close()
}
console.log(JSON.stringify({ output, routes: results.length, centerMisses: results.flatMap(r => r.steps.filter(s => s.hits && !s.hits[0]).map(s => ({ path: r.path, theme: r.theme, ...s }))) }))
