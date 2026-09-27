import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const metadataPath = process.env.HELUO_QUALITY_ENV_FILE
  ? resolve(process.env.HELUO_QUALITY_ENV_FILE)
  : resolve(root, 'artifacts/sitewide-quality/mysql-environment.json')
const { baseURL } = JSON.parse(readFileSync(metadataPath, 'utf8'))
const target = new URL(baseURL)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('Lighthouse runner requires a local quality environment.')
}
const readiness = await fetch(new URL('/api/v1/ready', target), { signal: AbortSignal.timeout(5000) })
if (!readiness.ok || (await readiness.json()).data?.status !== 'UP') throw new Error('Quality API is not ready.')
const requireTool = createRequire(resolve(root, 'artifacts/testing-tools/package.json'))
const { default: lighthouse } = await import(pathToFileURL(requireTool.resolve('lighthouse')).href)
const { launch } = await import(pathToFileURL(requireTool.resolve('chrome-launcher')).href)
const { default: desktopConfig } = await import(pathToFileURL(requireTool.resolve('lighthouse/core/config/desktop-config.js')).href)
const output = resolve(root, `artifacts/open-source-testing/lighthouse-${Date.now()}`)
mkdirSync(output, { recursive: true })
const results = []
for (const mode of ['mobile', 'desktop']) {
  for (const route of ['/', '/explore', '/appointment', '/shop']) {
    const name = `${route === '/' ? 'home' : route.slice(1)}-${mode}`
    const profile = resolve(output, 'profiles', name)
    mkdirSync(profile, { recursive: true })
    const chrome = await launch({ userDataDir: profile, chromeFlags: ['--headless=new', '--no-first-run'] })
    try {
      const run = await lighthouse(new URL(route, target).href, {
        port: chrome.port, output: ['html', 'json'], logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      }, mode === 'desktop' ? desktopConfig : undefined)
      if (!run) throw new Error('Lighthouse returned no result.')
      writeFileSync(resolve(output, `${name}.html`), run.report[0])
      writeFileSync(resolve(output, `${name}.json`), run.report[1])
      const { lhr } = run
      if (lhr.runtimeError) throw new Error(lhr.runtimeError.message)
      if (lhr.configSettings.formFactor !== mode) throw new Error('Lighthouse form factor does not match the requested mode.')
      const row = {
        route, mode, url: lhr.finalDisplayedUrl, version: lhr.lighthouseVersion,
        settings: { formFactor: lhr.configSettings.formFactor, screenEmulation: lhr.configSettings.screenEmulation, throttling: lhr.configSettings.throttling },
        scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, value.score === null ? null : Math.round(value.score * 100)])),
        lcpMs: lhr.audits['largest-contentful-paint'].numericValue,
        cls: lhr.audits['cumulative-layout-shift'].numericValue,
        tbtMs: lhr.audits['total-blocking-time'].numericValue,
        findings: Object.entries(lhr.audits).filter(([, audit]) => audit.score !== null && audit.score < 1)
          .map(([id, audit]) => ({ id, title: audit.title, score: audit.score, displayValue: audit.displayValue })),
      }
      results.push(row)
      console.log(JSON.stringify({ route, mode, scores: row.scores, lcpMs: row.lcpMs, cls: row.cls }))
    } catch (error) {
      results.push({ route, mode, error: error.message })
      process.exitCode = 1
    } finally {
      writeFileSync(resolve(output, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), baseURL, results }, null, 2))
      await chrome.kill()
    }
  }
}
console.log(`Lighthouse reports: ${output}`)
