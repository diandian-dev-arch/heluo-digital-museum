import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Plan A: a bounded 10-minute observation, not a recurring keep-alive or a load test.
const origin = 'https://heluo.pocketbay.app'
const output = resolve('../artifacts/holistic', `availability-${Date.now()}`)
await mkdir(output, { recursive: true })
const evidence = { startedAt: new Date().toISOString(), origin, intervalMs: 30000, plannedRounds: 21,
  rounds: [], assetFingerprints: [], passed: false,
  scope: 'Existing public version after explicit visitor wake; not latest local changes, idle cold start, or SLA.' }
async function request(path) {
  const started = Date.now()
  const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
  const text = await response.text()
  return { path, status: response.status, elapsedMs: Date.now() - started,
    contentType: response.headers.get('content-type'), bytes: Buffer.byteLength(text), text }
}
const started = Date.now()
for (let round = 0; round < 21; round++) {
  const delay = started + round * 30000 - Date.now()
  if (delay > 0) await new Promise(done => setTimeout(done, delay))
  const result = { at: new Date().toISOString(), elapsedMs: Date.now() - started, checks: [], passed: true }
  for (const path of ['/', '/api/v1/health', '/api/v1/ready', '/api/v1/categories']) {
    try {
      const response = await request(path)
      const { text, ...record } = response
      record.sha256 = createHash('sha256').update(text).digest('hex')
      assert.equal(response.status, 200)
      if (path === '/') {
        assert.match(text, /id="app"/)
        if (round === 0 || round === 20) {
          const assets = [...text.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1])
          assert.ok(assets.length > 0)
          for (const assetPath of assets) {
            const asset = await request(assetPath)
            assert.equal(asset.status, 200)
            evidence.assetFingerprints.push({ round, path: assetPath, sha256: createHash('sha256').update(asset.text).digest('hex') })
          }
        }
      } else {
        assert.match(response.contentType ?? '', /application\/json/)
        const body = JSON.parse(text)
        assert.equal(body.code, 'OK')
        if (path.endsWith('/health') || path.endsWith('/ready')) assert.equal(body.data.status, 'UP')
        else assert.ok(Array.isArray(body.data) && body.data.length > 0)
      }
      result.checks.push({ ...record, passed: true })
    } catch (error) {
      result.passed = false
      result.checks.push({ path, passed: false, error: error.message })
    }
  }
  evidence.rounds.push(result)
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ round: round + 1, passed: result.passed, elapsedMs: result.elapsedMs }))
}
const hashes = round => evidence.assetFingerprints.filter(item => item.round === round).map(({ path, sha256 }) => ({ path, sha256 }))
evidence.stableAssets = JSON.stringify(hashes(0)) === JSON.stringify(hashes(20)) && hashes(0).length > 0
evidence.passed = evidence.rounds.every(round => round.passed) && evidence.stableAssets
evidence.finishedAt = new Date().toISOString()
await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({ output, passed: evidence.passed, stableAssets: evidence.stableAssets }))
if (!evidence.passed) process.exitCode = 1
