import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve('..')
const env = JSON.parse(await readFile(process.env.HELUO_QUALITY_ENV_FILE || resolve(root, 'artifacts/sitewide-quality/current-environment.json'), 'utf8'))
if (new URL(env.baseURL).hostname !== '127.0.0.1') throw new Error('Use the isolated local environment')
const requireTool = createRequire(resolve(root, 'artifacts/testing-tools/package.json'))
const { default: lighthouse } = await import(pathToFileURL(requireTool.resolve('lighthouse')).href)
const { launch } = await import(pathToFileURL(requireTool.resolve('chrome-launcher')).href)
const output = resolve(process.env.HELUO_PERFORMANCE_OUTPUT || resolve(root, 'artifacts/premium-visual-2026-09-10/performance'))
await mkdir(output, { recursive: true })
async function fingerprint() {
  const response = await fetch(env.baseURL)
  if (response.status !== 200) throw new Error('Performance target is unavailable')
  return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
}
const buildSignature = await fingerprint()
const rows = []
const throttling = { rttMs: 40, throughputKbps: 9000, cpuSlowdownMultiplier: 4 }
for (const route of ['/', '/explore', '/appointment', '/shop']) {
  for (let sample = 1; sample <= 3; sample++) {
    const name = `${route.slice(1) || 'home'}-${sample}`
    const profile = resolve(output, 'profiles', `${name}-${Date.now()}`)
    await mkdir(profile, { recursive: true })
    const chrome = await launch({ userDataDir: profile, chromeFlags: ['--headless=new', '--no-first-run'] })
    try {
      const result = await lighthouse(new URL(route, env.baseURL).href, {
        port: chrome.port, output: 'json', logLevel: 'error',
        onlyCategories: ['performance'], throttlingMethod: 'simulate', throttling,
      })
      if (!result || result.lhr.runtimeError) throw new Error(result?.lhr.runtimeError?.message || 'No Lighthouse result')
      await writeFile(resolve(output, `${name}.json`), result.report)
      const audits = result.lhr.audits
      rows.push({ route, sample, lcpMs: audits['largest-contentful-paint'].numericValue, cls: audits['cumulative-layout-shift'].numericValue })
      console.log(JSON.stringify(rows.at(-1)))
    } finally { await chrome.kill() }
  }
}
const medians = [...new Set(rows.map(row => row.route))].map(route => {
  const samples = rows.filter(row => row.route === route)
  return { route, lcpMs: samples.map(row => row.lcpMs).sort((a, b) => a - b)[1], cls: samples.map(row => row.cls).sort((a, b) => a - b)[1] }
})
const buildUnchanged = buildSignature === await fingerprint()
const passed = buildUnchanged && medians.every(row => row.lcpMs <= 2500 && row.cls <= .1)
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ timestamp: new Date().toISOString(), baseURL: env.baseURL, environmentLabel: env.label, buildSignature, buildUnchanged, network: 'Simulated Fast 4G, fresh Chrome and cold storage per run; isolated local API', throttling, rows, medians, passed }, null, 2))
console.log(JSON.stringify({ medians, passed }))
if (!passed) process.exitCode = 1
