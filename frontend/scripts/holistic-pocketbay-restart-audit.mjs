import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const environment = JSON.parse(await readFile(resolve('../artifacts/sitewide-quality/pocketbay-environment.json'), 'utf8'))
assert.match(environment.name, /^heluo-pocketbay-quality-\d+$/)
assert.equal(environment.baseURL, 'http://127.0.0.1:4197')
const output = resolve('../artifacts/holistic', `pocketbay-restart-${Date.now()}`)
await mkdir(output, { recursive: true })
let token
async function request(path, options = {}) {
  const response = await fetch(`${environment.baseURL}${path}`, { ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, path)
  return (await response.json()).data
}
const login = await request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(environment.admin) })
token = login.accessToken
assert.ok(token)
const before = await request('/api/v1/admin/orders?status=PAID&page=1&size=100')
assert.ok(before.total > 0, 'Business tests must have created isolated paid orders first.')
const stable = data => ({ total: data.total, items: data.items.map(item => ({ id: item.id, status: item.status, orderNo: item.orderNo })) })
const started = Date.now()
await new Promise((done, reject) => {
  const child = spawn('docker', ['restart', environment.name], { windowsHide: true, stdio: 'ignore' })
  child.once('error', reject)
  child.once('close', code => code === 0 ? done() : reject(new Error(`Restart failed: ${code}`)))
})
let ready = false
while (Date.now() - started < 90000) {
  try { ready = (await request('/api/v1/ready')).status === 'UP' } catch {}
  if (ready) break
  await new Promise(done => setTimeout(done, 1000))
}
assert.ok(ready, 'Restart readiness timeout')
const after = await request('/api/v1/admin/orders?status=PAID&page=1&size=100')
assert.deepEqual(stable(after), stable(before), 'Persisted paid orders changed after container restart.')
const evidence = { timestamp: new Date().toISOString(), container: environment.name, passed: true,
  restartToReadyMs: Date.now() - started, paidOrders: after.total, existingTokenStillAuthorized: true,
  scope: 'Isolated root Dockerfile container restart and named-volume persistence; not Windows reboot or platform cold start.' }
await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({ output, ...evidence }))
