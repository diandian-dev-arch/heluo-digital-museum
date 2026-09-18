import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const output = resolve(process.env.HELUO_AUDIT_OUTPUT ?? '../artifacts/premium-visual-2026-09-10/accessibility')
await mkdir(output, { recursive: true })
const env = JSON.parse(await readFile(process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/current-environment.json', 'utf8'))
env.baseURL = process.env.HELUO_BASE_URL ?? env.baseURL
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Local isolation required')
const servedSignature = async () => { const response = await fetch(env.baseURL); if (!response.ok) throw new Error(`Entry HTTP ${response.status}`); return createHash('sha256').update(await response.text()).digest('hex') }
const buildSignature = await servedSignature()
const before = JSON.parse(await readFile('../artifacts/premium-visual-2026-09-10/after-visual-summary.json', 'utf8'))
const routes = [...new Map(before.results.map(row => [row.name, { name: row.name, path: row.path }])).values()]
const login = await fetch(`${env.baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
if (!login.ok) throw new Error(`Local login ${login.status}`)
const token = (await login.json()).data.accessToken
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale, token }) => {
      localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', locale)
      if (location.pathname.startsWith('/admin') || location.pathname === '/profile') localStorage.setItem('heluo.access-token', token)
    }, { theme, locale, token })
    const page = await context.newPage()
    for (const route of routes) {
      await page.goto(`${env.baseURL}${route.path}`, { waitUntil: 'domcontentloaded' })
      await page.locator('h1').first().waitFor({ state: 'attached' })
      await page.evaluate(async () => {
        for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight) { scrollTo(0, top); await new Promise(r => setTimeout(r, 40)) }
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})))
        await document.fonts.ready; scrollTo(0, 0)
      })
      // Route entrances include short GSAP opacity transitions, even in reduced motion.
      await page.waitForTimeout(1200)
      await page.addScriptTag({ path: resolve('../artifacts/testing-tools/node_modules/axe-core/axe.min.js') })
      const report = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })
        const compact = items => items.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary, checks: [...node.any, ...node.all, ...node.none].map(check => ({ id: check.id, data: check.data, message: check.message })) })) }))
        return { violations: compact(result.violations), incomplete: compact(result.incomplete), passes: result.passes.map(item => item.id) }
      })
      await page.screenshot({ path: resolve(output, `${route.name}-${width}-${theme}-${locale}.png`), fullPage: true })
      results.push({ ...route, width, theme, locale, ...report })
      console.log(`${route.name} ${width} ${theme} ${locale}: ${report.violations.length} violations, ${report.incomplete.length} manual checks`)
      await writeFile(resolve(output, 'summary.json'), JSON.stringify({ timestamp: new Date().toISOString(), baseURL: env.baseURL, buildSignature, complete: results.length === routes.length * 8, scope: 'Rendered route states; axe WCAG A/AA. Incomplete results require manual review; does not prove all non-text boundary contrast.', results }, null, 2))
    }
    await context.close()
  }
  if (await servedSignature() !== buildSignature) throw new Error('Served build changed during audit')
} finally { await browser.close() }
if (results.some(row => row.violations.length)) process.exitCode = 1
