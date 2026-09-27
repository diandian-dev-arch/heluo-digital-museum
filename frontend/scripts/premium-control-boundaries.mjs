import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const env = JSON.parse(await readFile(process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/current-environment.json', 'utf8'))
env.baseURL = process.env.HELUO_BASE_URL ?? env.baseURL
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const output = resolve(process.env.HELUO_AUDIT_OUTPUT ?? '../artifacts/premium-visual-2026-09-10/control-boundaries')
await mkdir(output, { recursive: true })
const entryResponse = await fetch(env.baseURL)
if (!entryResponse.ok) throw new Error(`Entry HTTP ${entryResponse.status}`)
const buildSignature = createHash('sha256').update(await entryResponse.text()).digest('hex')
const login = await fetch(`${env.baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
if (!login.ok) throw new Error(`Local login ${login.status}`)
const token = (await login.json()).data.accessToken
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const requestedPaths = process.argv.slice(2)
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const path of ['/explore', '/appointment', '/login', '/profile', '/admin', '/admin/operations']) {
    if (requestedPaths.length && !requestedPaths.includes(path)) continue
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, token, path }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', 'zh-CN')
      if (path !== '/login') localStorage.setItem('heluo.access-token', token)
    }, { theme, token, path })
    const page = await context.newPage()
    await page.goto(`${env.baseURL}${path}`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').first().waitFor({ state: 'attached' })
    await page.waitForTimeout(1000)
    if (path === '/appointment' && width < 768) {
      await page.locator('.appointment-day:not(:disabled)').first().click()
      await page.locator('.appointment-time:not(:disabled)').first().click()
      await page.locator('.appointment-mobile-action .fluid-button').click()
      await page.locator('.appointment-bottom-sheet input').first().waitFor({ state: 'visible' })
    }
    // Native fields and Element Plus selects need a discernible input boundary.
    // Dedupe identical computed appearances, not only tag names.
    const ids = await page.evaluate(() => {
      const styles = new Set(), ids = []
      for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select, .el-select__wrapper, .museum-search-field__control, .appointment-quantity')) {
        if (el.matches('input') && el.closest('.appointment-quantity')) continue
        if (el.matches('input') && el.closest('.museum-search-field__control')) continue
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest('.el-select__input-wrapper') || el.matches(':disabled')) continue
        const s = getComputedStyle(el), r = el.getBoundingClientRect()
        if (r.width < 20 || r.height < 20) continue
        const key = [el.tagName, s.background, s.border, s.boxShadow].join('|')
        if (styles.has(key)) continue
        styles.add(key)
        el.dataset.boundaryAudit = String(ids.length)
        ids.push(String(ids.length))
      }
      return ids
    })
    for (const id of ids) for (const state of ['default', 'focus']) {
      const control = page.locator(`[data-boundary-audit="${id}"]`)
      await control.scrollIntoViewIfNeeded()
      await control.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
      if (state === 'focus') {
        const focusable = await control.evaluate(el => el.matches('input,textarea,select')) ? control : control.locator('input').first()
        if (await focusable.count()) {
          await focusable.focus()
          await page.keyboard.press('Shift+Tab')
          await page.keyboard.press('Tab')
        }
      } else await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(200)
      const metrics = await control.evaluate(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el)
        const matchedBorders = []
        const visit = rules => { for (const rule of rules) {
          if (rule.selectorText && /border/.test(rule.style?.cssText || '') && el.matches(rule.selectorText)) matchedBorders.push({ selector: rule.selectorText, style: rule.style.cssText })
          if (rule.cssRules) visit(rule.cssRules)
        } }
        for (const sheet of document.styleSheets) { try { visit(sheet.cssRules) } catch {} }
        el.dataset.boundaryRules = JSON.stringify(matchedBorders)
        return { tag: el.tagName, class: el.className, label: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.closest('label')?.textContent.trim().slice(0, 50), x: r.x, y: r.y, width: r.width, height: r.height, border: s.borderColor, borderWidth: parseFloat(s.borderLeftWidth), outlineWidth: parseFloat(s.outlineWidth), outlineOffset: parseFloat(s.outlineOffset), outline: s.outlineColor, shadow: s.boxShadow, focusWithin: el.contains(document.activeElement), focusVisible: el.matches(':focus-visible') }
      })
      const shot = await page.screenshot()
      const measure = await page.evaluate(async ({ data, m, state }) => {
        const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode()
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
        const lum = rgb => rgb.slice(0, 3).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 }).reduce((a, n, i) => a + n * [.2126, .7152, .0722][i], 0)
        const at = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data]
        const ratio = (a, b) => { const l = lum(a), r = lum(b); return (Math.max(l, r) + .05) / (Math.min(l, r) + .05) }
        const sides = [
          { x: m.x, y: m.y + m.height / 2, dx: -1, dy: 0 },
          { x: m.x + m.width - 1, y: m.y + m.height / 2, dx: 1, dy: 0 },
          { x: m.x + m.width / 2, y: m.y, dx: 0, dy: -1 },
          { x: m.x + m.width / 2, y: m.y + m.height - 1, dx: 0, dy: 1 },
        ]
        const samples = sides.filter(p => p.x > 8 && p.x < innerWidth - 8 && p.y > 80 && p.y < innerHeight - 90).map(p => {
          const outer = at(p.x + p.dx * 7, p.y + p.dy * 7)
          // Sample the full boundary strip, covering inset borders and focus rings.
          // Best contrast proves a visible line exists; it does not prove its area.
          const strip = Array.from({ length: state === 'focus' ? 10 : 4 }, (_, i) => i - 2)
          const best = Math.max(...strip.map(d => ratio(at(p.x + p.dx * d, p.y + p.dy * d), outer)))
          return Number(best.toFixed(2))
        })
        return { sides: samples, minimum: samples.length ? Math.min(...samples) : null }
      }, { data: shot.toString('base64'), m: metrics, state })
      const row = { path, viewportWidth: width, theme, state, ...metrics, ...measure, needsReview: measure.minimum === null || measure.minimum < 3 || (state === 'focus' && !metrics.focusWithin) }
      results.push(row)
      if (row.needsReview) row.matchedBorders = JSON.parse(await control.getAttribute('data-boundary-rules'))
      if (row.needsReview) await writeFile(resolve(output, `${path.replaceAll('/', '-')}-${width}-${theme}-${id}-${state}.png`), shot)
    }
    console.log(`${path} ${width} ${theme}: ${ids.length} field appearances`)
    await context.close()
    await writeFile(resolve(output, 'summary.json'), JSON.stringify({ complete: false, buildSignature, scope: 'Default/focus boundary strips of distinct visible input appearances on six routes, Chinese, two viewports/themes. Pixel sampling clues; not all controls or full ring area.', results }, null, 2))
  }
} finally { await browser.close() }
const report = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'))
report.complete = true
await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ samples: results.length, review: results.filter(r => r.needsReview).length }))
