import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Public, read-only evidence. No credentials or administrative records are collected.
const baseURL = process.env.HELUO_CONTENT_API_URL ?? 'http://127.0.0.1:18082'
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname), 'Use an isolated local API.')
const output = resolve('../artifacts/holistic', `content-${Date.now()}`)
await mkdir(output, { recursive: true })
async function read(path) {
  const response = await fetch(new URL(path, baseURL), { signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200, path)
  return (await response.json()).data
}
async function all(path) {
  const first = await read(path)
  if (Array.isArray(first)) return first
  const items = [...first.items]
  for (let page = 2; page <= first.totalPages; page++) items.push(...(await read(`${path}?page=${page}`)).items)
  assert.equal(items.length, first.total, `${path}: incomplete inventory`)
  return items
}
const evidence = { timestamp: new Date().toISOString(), baseURL, scope: 'Isolated local published content; not production or legal clearance.', artifacts: [], articles: [], exhibits: [], products: [] }
try {
  for (const kind of ['artifacts', 'articles', 'exhibits']) {
    for (const item of await all(`/api/v1/${kind}`)) {
      const detail = await read(`/api/v1/${kind}/${encodeURIComponent(item.slug)}`)
      evidence[kind].push({ ...detail, contentSha256: createHash('sha256').update(JSON.stringify(detail)).digest('hex') })
    }
  }
  evidence.products = await all('/api/v1/products')
  const ding = evidence.artifacts.find(item => item.slug === 'heluo-bronze-ding')
  const jue = evidence.artifacts.find(item => item.slug === 'heluo-bronze-jue')
  const exhibit = evidence.exhibits.find(item => item.slug === 'heluo-bronze-ding-3d')
  assert.ok(ding && jue && exhibit, 'Separate ding, jue, and 3D records must exist.')
  assert.notEqual(ding.id, jue.id)
  assert.equal(exhibit.artifact.slug, ding.slug)
  assert.ok(ding.exhibits.some(item => item.slug === exhibit.slug))
  assert.ok(!jue.exhibits.some(item => item.slug === exhibit.slug))
  assert.match(ding.content, /1962\.281/)
  assert.match(ding.content, /CC0/)
  assert.match(ding.content, /不是河洛地区出土/)
  for (const item of evidence.artifacts) assert.match(item.title, /概念展品|数字重制/, item.slug)
  const sitemapResponse = await fetch(new URL('/sitemap.xml', baseURL))
  assert.equal(sitemapResponse.status, 200)
  const sitemap = await sitemapResponse.text()
  for (const kind of ['artifacts', 'articles', 'exhibits']) {
    for (const item of evidence[kind]) assert.ok(sitemap.includes(`/${kind}/${item.slug}</loc>`), `Missing index entry: ${item.slug}`)
  }
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.failure = error.message
  process.exitCode = 1
} finally {
  await writeFile(resolve(output, 'inventory.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, passed: evidence.passed, counts: Object.fromEntries(['artifacts', 'articles', 'exhibits', 'products'].map(kind => [kind, evidence[kind].length])), failure: evidence.failure }))
}
