import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'node:net'

const metadata = JSON.parse(await readFile(resolve('../artifacts/sitewide-quality/docker-environment.json'), 'utf8'))
assert.match(metadata.projectName, /^heluo-quality-\d+$/)
const reportPath = process.argv[2]
assert.ok(reportPath, 'Pass the successful local restore summary.json path.')
const restore = JSON.parse(await readFile(resolve(reportPath), 'utf8'))
assert.equal(restore.passed, true)
assert.equal(restore.project, metadata.projectName)
assert.match(restore.restoredDatabase, /^museum_restore_\d+$/)
assert.match(metadata.environment.MYSQL_USER, /^[a-z][a-z0-9_]+$/)
const exec = promisify(execFile)
const options = { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }
const sourceBackend = `${metadata.projectName}-backend-1`
const sourceMysql = `${metadata.projectName}-mysql-1`
const network = `${metadata.projectName}_museum-network`
for (const container of [sourceBackend, sourceMysql]) {
  const result = await exec('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', container], options)
  assert.equal(result.stdout.trim(), metadata.projectName)
}
const { stdout: imageOutput } = await exec('docker', ['inspect', '--format', '{{.Image}}', sourceBackend], options)
const imageId = imageOutput.trim()
assert.match(imageId, /^sha256:[a-f0-9]{64}$/)
const port = 4198
await new Promise((done, reject) => {
  const probe = createServer()
  probe.once('error', () => reject(new Error('Port 4198 is occupied; no existing service was changed.')))
  probe.listen(port, '127.0.0.1', () => probe.close(done))
})
const mysqlCommand = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --batch --raw --skip-column-names --execute="$1"'
async function query(sql) {
  const { stdout } = await exec('docker', ['exec', sourceMysql, 'sh', '-c', mysqlCommand, 'restore-app-audit', sql], options)
  return stdout.trim()
}
// Grant only the newly restored schema to the existing isolated application account.
await query(`GRANT ALL PRIVILEGES ON ${restore.restoredDatabase}.* TO '${metadata.environment.MYSQL_USER}'@'%'`)
const expectedOrders = Number(await query(`SELECT COUNT(*) FROM ${restore.restoredDatabase}.orders`))
const expectedAppointments = Number(await query(`SELECT COUNT(*) FROM ${restore.restoredDatabase}.appointments`))
const name = `heluo-restored-app-${Date.now()}`
const output = resolve('../artifacts/holistic', name)
await mkdir(output, { recursive: true })
const baseURL = `http://127.0.0.1:${port}`
const environment = {
  ...Object.fromEntries(Object.entries(metadata.environment).filter(([key]) => key.startsWith('MUSEUM_'))),
  MUSEUM_DB_URL: `jdbc:mysql://${sourceMysql}:3306/${restore.restoredDatabase}?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`,
  MUSEUM_DB_USERNAME: metadata.environment.MYSQL_USER,
  MUSEUM_DB_PASSWORD: metadata.environment.MYSQL_PASSWORD,
  MUSEUM_BOOTSTRAP_ENABLED: 'false', MUSEUM_PUBLIC_BASE_URL: baseURL, MUSEUM_SMTP_HOST: '',
  MUSEUM_ORDER_EXPIRY_INITIAL_DELAY_MS: '3600000',
}
const evidence = { name, imageId, restoredDatabase: restore.restoredDatabase, baseURL,
  timestamp: new Date().toISOString(), passed: false, stopped: false, checks: [] }
async function request(path, token, body) {
  const response = await fetch(`${baseURL}/api/v1${path}`, { method: body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, `Unexpected HTTP status for ${path}`)
  return (await response.json()).data
}
let started = false
try {
  await exec('docker', ['run', '-d', '--name', name, '--network', network, '-p', `127.0.0.1:${port}:8080`,
    ...Object.keys(environment).flatMap(key => ['-e', key]), imageId], { ...options, env: { ...process.env, ...environment } })
  started = true
  const deadline = Date.now() + 90000
  let ready = false
  while (Date.now() < deadline) {
    try { ready = (await request('/ready')).status === 'UP' } catch {}
    if (ready) break
    await new Promise(done => setTimeout(done, 1000))
  }
  assert.ok(ready, 'Restored application did not become ready.')
  assert.equal((await request('/health')).status, 'UP')
  evidence.checks.push('health and readiness UP after Flyway and ORM validation')
  const login = await request('/auth/login', null, metadata.admin)
  assert.ok(login.accessToken)
  const me = await request('/auth/me', login.accessToken)
  assert.ok(me.roles.includes('ADMIN'))
  evidence.checks.push('existing restored administrator login and role')
  const orders = await request('/admin/orders?page=1&size=1', login.accessToken)
  const appointments = await request('/admin/appointments?page=1&size=1', login.accessToken)
  assert.equal(orders.total, expectedOrders)
  assert.equal(appointments.total, expectedAppointments)
  evidence.orders = orders.total
  evidence.appointments = appointments.total
  evidence.checks.push('restored order and appointment API totals equal database counts')
  const ding = await request('/artifacts/heluo-bronze-ding')
  assert.equal(ding.title, '河洛青铜鼎（数字重制）')
  assert.ok(ding.exhibits.some(item => item.slug === 'heluo-bronze-ding-3d'))
  evidence.checks.push('restored public ding content and linked exhibit')
  evidence.passed = true
} finally {
  if (started) {
    await exec('docker', ['stop', name], options)
    evidence.stopped = true
  }
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, ...evidence }))
}
