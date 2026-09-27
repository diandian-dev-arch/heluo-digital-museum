import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const env = JSON.parse(await readFile(process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/current-environment.json', 'utf8'))
const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4189'
if (new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const output = resolve(process.env.HELUO_AUDIT_OUTPUT ?? '../artifacts/premium-visual-2026-09-12/select-short-text-followup')
await mkdir(output, { recursive: true })
const source = JSON.parse(await readFile('../artifacts/premium-visual-2026-09-12/accessibility/summary.json', 'utf8'))
const signature = async () => createHash('sha256').update(await (await fetch(baseURL)).text()).digest('hex')
const buildSignature = await signature()
const auth = await fetch(`${baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
if (!auth.ok) throw new Error(`Login HTTP ${auth.status}`)
const token = (await auth.json()).data.accessToken
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = [], blockedWrites = []
let complete = false
try {
  for (const row of source.results.filter(r => r.name === 'admin' || r.name === 'operations')) {
    const context = await browser.newContext({ viewport: { width: row.width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ token, row }) => {
      localStorage.setItem('heluo.access-token', token)
      localStorage.setItem('heluo.theme', row.theme)
      localStorage.setItem('heluo.locale', row.locale)
    }, { token, row })
    await context.route('**/api/**', async route => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
        blockedWrites.push({ method: route.request().method(), path: new URL(route.request().url()).pathname })
        await route.abort(); return
      }
      await route.continue()
    })
    const page = await context.newPage()
    await page.goto(`${baseURL}${row.path}`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').waitFor()
    await page.waitForTimeout(1200)
    const result = { name: row.name, width: row.width, theme: row.theme, locale: row.locale }
    if (row.name === 'admin') {
      const input = page.locator('.el-select__wrapper input[role="combobox"]').first()
      await input.waitFor({ state: 'attached' })
      await input.focus()
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(250)
      result.open = await input.evaluate(el => {
        const id = el.getAttribute('aria-controls'), target = document.getElementById(id)
        const active = document.getElementById(el.getAttribute('aria-activedescendant'))
        return { controls: id, exists: !!target, role: target?.getAttribute('role'), expanded: el.getAttribute('aria-expanded'), options: target?.querySelectorAll('[role="option"]').length ?? 0, activeInList: !!active && target?.contains(active) }
      })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      result.selected = await input.evaluate(el => ({ expanded: el.getAttribute('aria-expanded'), text: el.closest('.el-select')?.innerText, focused: document.activeElement === el }))
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Escape')
      result.closed = await input.evaluate(el => ({ expanded: el.getAttribute('aria-expanded'), focused: document.activeElement === el }))
      result.passed = result.open.exists && result.open.role === 'listbox' && result.open.options > 0 && result.open.expanded === 'true' && result.selected.expanded === 'false' && result.closed.expanded === 'false' && result.closed.focused
    } else {
      result.samples = []
      const nodes = row.incomplete.flatMap(r => r.nodes).filter(n => n.checks.some(c => c.data?.messageKey === 'shortTextContent'))
      for (const node of nodes) {
        const el = page.locator(node.target[0])
        await el.scrollIntoViewIfNeeded()
        await el.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
        await page.waitForTimeout(150)
        const metrics = await el.evaluate(el => {
          const s = getComputedStyle(el), range = document.createRange(); range.selectNodeContents(el)
          const r = range.getBoundingClientRect()
          return { text: el.textContent, color: s.color, opacity: s.opacity, fontSize: s.fontSize, fontWeight: s.fontWeight, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, previous: el.getAttribute('style') }
        })
        await el.evaluate(el => { el.style.setProperty('transition', 'none', 'important'); el.style.setProperty('color', 'transparent', 'important'); el.style.setProperty('text-shadow', 'none', 'important') })
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const shot = await page.screenshot()
        await el.evaluate((el, previous) => previous === null ? el.removeAttribute('style') : el.setAttribute('style', previous), metrics.previous)
        const threshold = Number(node.checks.find(c => c.data?.messageKey === 'shortTextContent').data.expectedContrastRatio.split(':')[0])
        const sample = await page.evaluate(async ({ data, metrics, threshold }) => {
          const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode()
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
          const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
          const colorCanvas = document.createElement('canvas'), colorCtx = colorCanvas.getContext('2d')
          colorCtx.fillStyle = metrics.color; colorCtx.fillRect(0, 0, 1, 1)
          const fg = [...colorCtx.getImageData(0, 0, 1, 1).data]
          const lum = c => c.slice(0, 3).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 }).reduce((a, n, i) => a + n * [.2126, .7152, .0722][i], 0)
          let minimum = Infinity, count = 0
          const r = metrics.rect
          for (let y = Math.max(0, Math.ceil(r.y)); y < Math.min(img.height, r.y + r.height); y += 2) for (let x = Math.max(0, Math.ceil(r.x)); x < Math.min(img.width, r.x + r.width); x += 2) {
            const bg = [...ctx.getImageData(x, y, 1, 1).data], alpha = fg[3] / 255 * Number(metrics.opacity)
            const composed = fg.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha))
            const l = lum(composed), b = lum(bg)
            minimum = Math.min(minimum, (Math.max(l, b) + .05) / (Math.min(l, b) + .05)); count++
          }
          return { minimum: Number(minimum.toFixed(3)), pixels: count, threshold, passed: count > 0 && minimum >= threshold }
        }, { data: shot.toString('base64'), metrics, threshold })
        const { previous, ...publicMetrics } = metrics
        result.samples.push({ target: node.target, ...publicMetrics, ...sample })
      }
      result.passed = result.samples.every(s => s.passed)
    }
    await page.screenshot({ path: resolve(output, `${row.name}-${row.width}-${row.theme}-${row.locale}.png`) })
    results.push(result)
    console.log(`${row.name} ${row.width} ${row.theme} ${row.locale}: ${result.passed ? 'pass' : 'review'}`)
    await context.close()
  }
  complete = await signature() === buildSignature
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ complete, baseURL, buildSignature, sourceBuildSignature: source.buildSignature, sourceMatches: buildSignature === source.buildSignature, blockedWrites, scope: 'Eight content select states and 36 operations short-text nodes; background rectangle pixel sampling at 2px, not glyph-mask or every possible scroll state.', results }, null, 2))
}
if (!complete || results.some(r => !r.passed) || blockedWrites.length) process.exitCode = 1
