import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, cpSync, copyFileSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Local verification of the real root Dockerfile, using the already frozen Compose source.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(root, 'artifacts/sitewide-quality')
if (process.argv.includes('--check')) {
  const current = JSON.parse(readFileSync(resolve(output, 'pocketbay-environment.json'), 'utf8'))
  if (current.baseURL !== 'http://127.0.0.1:4197') throw new Error('Unexpected local environment URL.')
  for (const path of ['/api/v1/health', '/api/v1/ready']) {
    const response = await fetch(`${current.baseURL}${path}`, { signal: AbortSignal.timeout(5000) })
    if (response.status !== 200 || (await response.json()).data?.status !== 'UP') throw new Error(`Failed ${path}`)
  }
  console.log('Existing root Dockerfile local service: health and readiness UP.')
} else {
const source = JSON.parse(readFileSync(resolve(output, 'docker-environment.json'), 'utf8'))
const port = 4197
await new Promise((done, reject) => {
  const probe = createServer()
  probe.once('error', () => reject(new Error('Port 4197 is occupied; no existing service was changed.')))
  probe.listen(port, '127.0.0.1', () => probe.close(done))
})
const name = `heluo-pocketbay-quality-${Date.now()}`
const snapshot = resolve(output, `${name}-source`)
mkdirSync(snapshot)
for (const module of ['frontend', 'backend']) cpSync(resolve(source.snapshot, module), resolve(snapshot, module), { recursive: true })
for (const file of ['Dockerfile', '.dockerignore', 'docker-entrypoint.sh']) copyFileSync(resolve(root, file), resolve(snapshot, file))
const hashes = {}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else hashes[relative(snapshot, path).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
}
walk(snapshot)
writeFileSync(resolve(output, `${name}-fingerprints.json`), JSON.stringify(hashes, null, 2))
const admin = { username: 'quality_admin', password: randomBytes(24).toString('base64url') }
const environment = {
  MUSEUM_JWT_SECRET: randomBytes(48).toString('base64url'),
  MUSEUM_DB_PASSWORD: randomBytes(24).toString('base64url'),
  MUSEUM_BOOTSTRAP_ENABLED: 'true', MUSEUM_BOOTSTRAP_ADMIN_USERNAME: admin.username,
  MUSEUM_BOOTSTRAP_ADMIN_PASSWORD: admin.password, MUSEUM_BOOTSTRAP_ADMIN_EMAIL: 'quality-admin@example.test',
  MUSEUM_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`, MUSEUM_SMTP_HOST: '',
}
const metadata = { label: 'pocketbay-local', name, snapshot, baseURL: environment.MUSEUM_PUBLIC_BASE_URL,
  apiURL: environment.MUSEUM_PUBLIC_BASE_URL, admin, environment, createdAt: new Date().toISOString() }
writeFileSync(resolve(output, 'pocketbay-environment.json'), JSON.stringify(metadata, null, 2))
async function docker(args) {
  await new Promise((done, reject) => {
    const log = openSync(resolve(output, `${name}-build.log`), 'a')
    const child = spawn('docker', args, { cwd: root, env: { ...process.env, ...environment }, windowsHide: true, stdio: ['ignore', log, log] })
    child.once('error', reject)
    child.once('close', code => {
      closeSync(log)
      code === 0 ? done() : reject(new Error(`Docker exit ${code}; see ${name}-build.log`))
    })
  })
}
console.log(`Building isolated root Dockerfile: ${name}`)
await docker(['build', '-t', `${name}:local`, snapshot])
await docker(['run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8080`,
  '--mount', `type=volume,source=${name}-data,target=/data`,
  ...Object.keys(environment).flatMap(key => ['-e', key]), `${name}:local`])
const deadline = Date.now() + 120000
let ready = false
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${metadata.baseURL}/api/v1/ready`, { signal: AbortSignal.timeout(3000) })
    if (response.status === 200 && (await response.json()).data?.status === 'UP') {
      console.log(`Root Dockerfile local service ready: ${metadata.baseURL}`)
      ready = true
      break
    }
  } catch {}
  await new Promise(done => setTimeout(done, 1000))
}
if (!ready) throw new Error(`Local container not ready; inspect docker logs ${name}. Container and volume preserved.`)
}
