import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(root, 'artifacts/sitewide-quality')
const metadataPath = resolve(output, 'docker-environment.json')
const sourceCompose = resolve(root, 'deploy/compose.yaml')
const sourceEnv = resolve(root, 'deploy/.env')
const webPort = 4196
const mailPort = 8027
mkdirSync(output, { recursive: true })

function run(args, env, logPath) {
  return new Promise((done, reject) => {
    const log = openSync(logPath, 'a')
    const child = spawn('docker', args, { cwd: root, env, windowsHide: true, stdio: ['ignore', log, log] })
    child.once('error', reject)
    child.once('close', code => {
      closeSync(log)
      code === 0 ? done() : reject(new Error(`Docker command failed (${code}); inspect ${logPath}`))
    })
  })
}

function composeArgs(metadata) {
  if (!/^heluo-quality-\d+$/.test(metadata.projectName)) throw new Error('Unexpected isolated Compose project name.')
  return ['compose', '--env-file', sourceEnv, '-f', sourceCompose, '-f', metadata.overridePath, '-p', metadata.projectName]
}

async function main() {
if (process.argv.includes('--check')) {
  const current = JSON.parse(readFileSync(metadataPath, 'utf8'))
  if (current.baseURL !== `http://127.0.0.1:${webPort}`) throw new Error('Unexpected local environment URL.')
  composeArgs(current)
  for (const path of ['/api/v1/health', '/api/v1/ready']) {
    const response = await fetch(`${current.baseURL}${path}`, { signal: AbortSignal.timeout(5000) })
    if (response.status !== 200 || (await response.json()).data?.status !== 'UP') throw new Error(`Failed ${path}`)
  }
  console.log('Existing isolated Compose service: health and readiness UP.')
  return
}
if (process.argv.includes('--stop')) {
  if (!existsSync(metadataPath)) throw new Error('No Docker quality metadata found.')
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  await run([...composeArgs(metadata), 'stop'], { ...process.env, ...metadata.environment }, resolve(output, `${metadata.projectName}-stop.log`))
  console.log('Stopped the isolated Compose project; containers, images and volumes are preserved.')
  return
}

for (const port of [webPort, mailPort]) {
  await new Promise((done, reject) => {
    const probe = createServer()
    probe.once('error', () => reject(new Error(`Port ${port} is occupied; existing services were not stopped.`)))
    probe.listen(port, '127.0.0.1', () => probe.close(done))
  })
}
if (!existsSync(sourceEnv)) throw new Error('Configure deploy/.env first; secrets are never printed.')
const runId = Date.now()
const projectName = `heluo-quality-${runId}`
const snapshot = resolve(output, `${projectName}-source`)
mkdirSync(snapshot)
const excluded = new Set(['node_modules', 'target', 'dist', '.git', 'test-results', 'playwright-report'])
for (const module of ['frontend', 'backend']) {
  cpSync(resolve(root, module), resolve(snapshot, module), { recursive: true, filter: path =>
    !excluded.has(basename(path)) && !basename(path).endsWith('.log')
    && (!basename(path).startsWith('.env') || basename(path) === '.env.example') })
}
const fingerprints = {}
function hashFiles(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name)
    if (item.isDirectory()) hashFiles(path)
    else if (item.isFile()) fingerprints[relative(snapshot, path).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(path)).digest('hex')
  }
}
hashFiles(snapshot)
writeFileSync(resolve(snapshot, 'fingerprints.json'), JSON.stringify(fingerprints, null, 2))
const overridePath = resolve(snapshot, 'compose.override.json')
writeFileSync(overridePath, JSON.stringify({ services: {
  frontend: { build: { context: resolve(snapshot, 'frontend') } },
  backend: { build: { context: resolve(snapshot, 'backend') } },
} }, null, 2))
const admin = { username: 'quality_admin', password: randomBytes(24).toString('base64url') }
const environment = {
  MYSQL_DATABASE: 'museum_quality', MYSQL_USER: 'quality_user',
  MYSQL_PASSWORD: randomBytes(24).toString('base64url'), MYSQL_ROOT_PASSWORD: randomBytes(24).toString('base64url'),
  MUSEUM_JWT_SECRET: randomBytes(48).toString('base64url'),
  MUSEUM_WEB_PORT: `127.0.0.1:${webPort}`, MUSEUM_MAIL_WEB_PORT: `127.0.0.1:${mailPort}`,
  MUSEUM_PUBLIC_BASE_URL: `http://127.0.0.1:${webPort}`, MUSEUM_BOOTSTRAP_ENABLED: 'true',
  MUSEUM_BOOTSTRAP_ADMIN_USERNAME: admin.username, MUSEUM_BOOTSTRAP_ADMIN_PASSWORD: admin.password,
  MUSEUM_BOOTSTRAP_ADMIN_EMAIL: 'quality-admin@example.test',
  MUSEUM_SMTP_HOST: 'mailpit', MUSEUM_SMTP_PORT: '1025', MUSEUM_SMTP_USERNAME: '', MUSEUM_SMTP_PASSWORD: '',
  MUSEUM_SMTP_AUTH: 'false', MUSEUM_SMTP_STARTTLS: 'false', MUSEUM_MAIL_FROM: 'no-reply@heluo.test',
}
const metadata = { label: 'docker', projectName, baseURL: environment.MUSEUM_PUBLIC_BASE_URL,
  apiURL: environment.MUSEUM_PUBLIC_BASE_URL, mailURL: `http://127.0.0.1:${mailPort}`,
  admin, environment, snapshot, overridePath, createdAt: new Date().toISOString() }
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
console.log(`Building isolated Compose snapshot ${projectName}; source files: ${Object.keys(fingerprints).length}`)
await run([...composeArgs(metadata), 'up', '-d', '--build'], { ...process.env, ...environment }, resolve(output, `${projectName}-build.log`))
const deadline = Date.now() + 120000
while (Date.now() < deadline) {
  try {
    const ready = await fetch(`${metadata.baseURL}/api/v1/ready`, { signal: AbortSignal.timeout(3000) })
    if (ready.status === 200 && (await ready.json()).data?.status === 'UP') {
      const response = await fetch(`${metadata.baseURL}/api/v1/auth/login`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin), signal: AbortSignal.timeout(3000) })
      if (response.status === 200) {
        console.log(`Isolated Docker quality environment ready: ${metadata.baseURL}`)
        return
      }
    }
  } catch {}
  await new Promise(done => setTimeout(done, 1000))
}
throw new Error('Compose started but application did not become ready; inspect this project logs. No data was removed.')
}

await main()
