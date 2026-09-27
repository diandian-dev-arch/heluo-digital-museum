import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
const env = JSON.parse(await readFile(process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/current-environment.json', 'utf8'))
env.baseURL = process.env.HELUO_BASE_URL ?? env.baseURL
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const axe = JSON.parse(await readFile(process.env.HELUO_ACCESSIBILITY_REPORT ?? '../artifacts/premium-visual-2026-09-10/accessibility/summary.json', 'utf8'))
if (axe.results.length !== 112) throw new Error('Wait for the complete 112-state accessibility route manifest before sampling')
const output = resolve(process.env.HELUO_AUDIT_OUTPUT ?? '../artifacts/premium-visual-2026-09-10/background-contrast')
await mkdir(output, { recursive: true })
const login = await fetch(`${env.baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
if (!login.ok) throw new Error(`Local admin login ${login.status}`)
const token = (await login.json()).data.accessToken
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const entryResponse = await fetch(env.baseURL)
if (!entryResponse.ok) throw new Error(`Entry HTTP ${entryResponse.status}`)
const buildSignature = createHash('sha256').update(await entryResponse.text()).digest('hex')
const extended = process.argv.includes('--extended')
const allLocales = process.argv.includes('--incomplete-all-locales')
const resume = process.argv.includes('--resume')
const requested = process.argv.slice(2).filter(arg => !['--extended', '--incomplete-all-locales', '--resume'].includes(arg))
const reportName = `summary${extended ? '-extended' : ''}${requested.length ? `-${requested.join('-')}` : ''}.json`
if (resume) {
  const previous = JSON.parse(await readFile(resolve(output, reportName), 'utf8'))
  if (previous.buildSignature !== buildSignature) throw new Error('Cannot resume across candidate builds')
  results.push(...previous.results)
}
try {
  // Extended mode checks both languages and overlapping document viewports.
  for (const row of axe.results.filter(row => (extended || allLocales || row.locale === 'zh-CN') && (!requested.length || requested.includes(row.name)))) {
    if (resume && !extended && results.some(r => r.name === row.name && r.width === row.width && r.theme === row.theme && r.locale === row.locale)) continue
    const context = await browser.newContext({ viewport: { width: row.width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, token, locale }) => {
      localStorage.setItem('heluo.theme', theme)
      localStorage.setItem('heluo.locale', locale)
      if (location.pathname.startsWith('/admin') || location.pathname === '/profile') localStorage.setItem('heluo.access-token', token)
    }, { theme: row.theme, token, locale: row.locale })
    const page = await context.newPage()
    await page.goto(`${env.baseURL}${row.path}`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').first().waitFor({ state: 'attached' })
    await page.waitForTimeout(1200)
    const selectors = extended ? ['body *'] : row.incomplete.filter(item => item.id === 'color-contrast').flatMap(item => item.nodes.map(node => node.target[0])).filter(target => typeof target === 'string')
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    const offsets = extended ? [...new Set([...Array(Math.ceil(pageHeight / 700)).keys()].map(i => Math.min(i * 700, Math.max(0, pageHeight - 900))))] : [0]
    for (const offset of offsets) {
    if (resume && results.some(r => r.name === row.name && r.width === row.width && r.theme === row.theme && r.locale === row.locale && r.offset === offset)) continue
    await page.evaluate(y => scrollTo(0, y), offset)
    await page.waitForTimeout(500)
    const samples = await page.evaluate(selectors => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
      return selectors.flatMap(selector => [...document.querySelectorAll(selector)].flatMap(el => {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || el.closest(':disabled, [aria-disabled="true"]')) return []
        const style = getComputedStyle(el)
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = style.color; ctx.fillRect(0, 0, 1, 1)
        const foreground = [...ctx.getImageData(0, 0, 1, 1).data]
        let opacity = 1
        for (let p = el; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity)
        const rects = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).flatMap(node => {
          const range = document.createRange(); range.selectNodeContents(node)
          return [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))
        }).filter(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= innerWidth && r.y + r.height <= innerHeight && r.width > 4 && r.height > 4)
          .filter(r => [[r.x + 2, r.y + 2], [r.x + r.width - 2, r.y + 2], [r.x + 2, r.y + r.height - 2], [r.x + r.width - 2, r.y + r.height - 2]].every(([x, y]) => el.contains(document.elementFromPoint(x, y))))
        if (!rects.length) return []
        return [{ selector: selector === 'body *' ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map(c => `.${c}`).join('')}` : selector, text: el.textContent.trim().slice(0, 70), foreground, opacity, rects,
          threshold: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700) ? 3 : 4.5 }]
      }))
    }, selectors)
    // Text fill is removed without changing layout or currentColor-based surfaces.
    const sheet = await page.addStyleTag({ content: '* { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' })
    await page.evaluate(async () => {
      // Scroll-promoted layers must repaint before pixel capture; otherwise Chrome
      // can return cached glyphs even though computed text fill is transparent.
      for (const el of document.querySelectorAll('body *')) {
        if (el instanceof HTMLElement && [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())) {
          el.dataset.auditOriginalStyle = el.getAttribute('style') ?? ''
          el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important')
          el.style.setProperty('text-shadow', 'none', 'important')
        }
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const background = await page.screenshot()
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-audit-original-style]')) {
        el.setAttribute('style', el.dataset.auditOriginalStyle)
        delete el.dataset.auditOriginalStyle
      }
    })
    await sheet.evaluate(el => el.remove())
    const measured = await page.evaluate(async ({ data, samples }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
      const luminance = rgb => rgb.slice(0, 3).map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
      return samples.map(sample => {
        let minimum = Infinity
        for (const rect of sample.rects) for (let y = Math.ceil(rect.y + 2); y < rect.y + rect.height - 2; y += 3) for (let x = Math.ceil(rect.x + 2); x < rect.x + rect.width - 2; x += 3) {
          const bg = [...ctx.getImageData(x, y, 1, 1).data]
          const alpha = sample.foreground[3] / 255 * sample.opacity
          const fg = sample.foreground.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha))
          const a = luminance(fg), b = luminance(bg)
          minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05))
        }
        return { ...sample, minimum: Number(minimum.toFixed(2)), needsReview: minimum < sample.threshold }
      })
    }, { data: background.toString('base64'), samples })
    results.push({ name: row.name, width: row.width, theme: row.theme, locale: row.locale, offset, measured })
    const captureName = `${row.name}-${row.width}-${row.theme}${extended || allLocales ? `-${row.locale}-${offset}` : ''}`
    if (requested.length || measured.some(item => item.needsReview)) {
      await writeFile(resolve(output, `${captureName}-background.png`), background)
      await page.screenshot({ path: resolve(output, `${captureName}.png`) })
    }
    await writeFile(resolve(output, reportName), JSON.stringify({ complete: false, buildSignature, scope: `${extended ? 'Both languages, overlapping document viewports, visible direct text excluding disabled controls' : allLocales ? 'Both languages, first viewport, axe incomplete targets' : 'Chinese first viewport, axe incomplete targets'}, sampled every 3px within direct text rectangles. Low values may reflect overlapping content, occlusion or rectangle edges; review required. Does not cover all glyph pixels, nested scroll containers or non-text boundaries.`, results }, null, 2))
    console.log(`${captureName}: ${measured.length} sampled, ${measured.filter(x => x.needsReview).length} review`)
    }
    await context.close()
  }
} finally { await browser.close() }
const report = JSON.parse(await readFile(resolve(output, reportName), 'utf8'))
report.endBuildSignature = createHash('sha256').update(await (await fetch(env.baseURL)).text()).digest('hex')
report.complete = report.endBuildSignature === buildSignature
await writeFile(resolve(output, reportName), JSON.stringify(report, null, 2))
if (!report.complete) throw new Error('Candidate changed during background sampling')
