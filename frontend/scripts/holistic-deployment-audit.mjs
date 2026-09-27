import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4196'
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname), 'Use an isolated local deployment.')
const output = resolve('../artifacts/holistic', `deployment-${Date.now()}`)
await mkdir(output, { recursive: true })
const evidence = { timestamp: new Date().toISOString(), baseURL, checks: [], passed: false }
async function request(path, options = {}) {
  const started = performance.now()
  const response = await fetch(new URL(path, baseURL), { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000) })
  const buffer = Buffer.from(await response.arrayBuffer())
  evidence.checks.push({ path, method: options.method ?? 'GET', status: response.status, bytes: buffer.length,
    elapsedMs: performance.now() - started, contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control'), contentRange: response.headers.get('content-range'),
    sha256: createHash('sha256').update(buffer).digest('hex') })
  return { response, buffer, text: buffer.toString('utf8') }
}
let browser
try {
  const home = await request('/')
  assert.equal(home.response.status, 200)
  assert.match(home.text, /id="app"/)
  for (const path of ['/api/v1/health', '/api/v1/ready']) {
    const result = await request(path)
    assert.equal(result.response.status, 200)
    assert.equal(JSON.parse(result.text).data.status, 'UP')
  }
  const robots = await request('/robots.txt')
  assert.equal(robots.response.status, 200)
  assert.ok(robots.text.includes(`Sitemap: ${baseURL}/sitemap.xml`))
  const sitemap = await request('/sitemap.xml')
  assert.equal(sitemap.response.status, 200)
  assert.match(sitemap.response.headers.get('content-type') ?? '', /xml/)
  browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
  const page = await browser.newPage()
  const parsed = await page.evaluate(xml => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    return { errors: document.querySelectorAll('parsererror').length, links: [...document.querySelectorAll('loc')].map(node => node.textContent) }
  }, sitemap.text)
  assert.equal(parsed.errors, 0)
  assert.ok(parsed.links.length > 5)
  for (const link of parsed.links) {
    assert.equal(new URL(link).origin, new URL(baseURL).origin)
    assert.ok(!/\/(admin|profile|login)(\/|$)/.test(new URL(link).pathname))
  }
  evidence.indexedUrls = parsed.links
  for (const path of ['/robots.txt', '/sitemap.xml']) {
    const head = await request(path, { method: 'HEAD' })
    assert.equal(head.response.status, 200)
    assert.equal(head.buffer.length, 0)
  }
  for (const path of ['/api/v1/auth/me', '/api/v1/admin/products']) assert.equal((await request(path)).response.status, 401)
  assert.equal((await request('/api/v1/artifacts/not-a-published-artifact')).response.status, 404)
  const assets = [...home.text.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1])
  assert.ok(assets.length >= 2)
  for (const path of assets) {
    const asset = await request(path)
    assert.equal(asset.response.status, 200)
    assert.match(asset.response.headers.get('cache-control') ?? '', /immutable/)
  }
  const model = await request('/media/models/heluo-bronze-ding-v5.5-mobile.glb', { headers: { Range: 'bytes=0-31' } })
  assert.equal(model.response.status, 206)
  assert.equal(model.buffer.length, 32)
  assert.equal(model.buffer.subarray(0, 4).toString(), 'glTF')
  assert.match(model.response.headers.get('content-range') ?? '', /^bytes 0-31\/837720$/)
  evidence.passed = true
} catch (error) {
  evidence.failure = error.message
  process.exitCode = 1
} finally {
  await browser?.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, passed: evidence.passed, checks: evidence.checks.length, failure: evidence.failure }))
}
