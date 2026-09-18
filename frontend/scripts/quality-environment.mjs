import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = process.argv.includes('--baseline')
const label = baseline ? 'baseline' : 'current'
const output = resolve(root, '../artifacts/sitewide-quality')
const metadataPath = resolve(output, `${label}-environment.json`)
const apiPort = baseline ? 18080 : 18081
const webPort = baseline ? 4188 : 4189
mkdirSync(output, { recursive: true })

if (process.argv.includes('--stop')) {
  if (!existsSync(metadataPath)) process.exit(0)
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  for (const pid of metadata.pids) {
    try { process.kill(pid) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  console.log(`Stopped ${label} quality environment.`)
  process.exit(0)
}

for (const port of [apiPort, webPort]) {
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })
    throw new Error(`Port ${port} is in use. Stop the existing quality environment first.`)
  } catch (error) { if (error.message.startsWith('Port ')) throw error }
}

const admin = { username: 'quality_admin', password: randomBytes(24).toString('base64url') }
const sourceJar = baseline ? resolve(output, 'baseline-api.jar') : resolve(root, '../backend/target/museum-api-0.1.0-SNAPSHOT.jar')
if (!existsSync(sourceJar)) throw new Error(`Build the backend before starting: ${sourceJar}`)
const jar = baseline ? sourceJar : resolve(output, `current-api-${Date.now()}.jar`)
if (!baseline) copyFileSync(sourceJar, jar)
const jarSha256 = createHash('sha256').update(readFileSync(jar)).digest('hex')
const env = {
  ...process.env,
  SPRING_PROFILES_ACTIVE: 'pocketbay',
  PORT: String(apiPort),
  POCKETBAY_DATA_DIR: resolve(output, `${label}-data-${Date.now()}`).replaceAll('\\', '/'),
  MUSEUM_JWT_SECRET: randomBytes(48).toString('base64url'),
  MUSEUM_BOOTSTRAP_ENABLED: 'true',
  MUSEUM_BOOTSTRAP_ADMIN_USERNAME: admin.username,
  MUSEUM_BOOTSTRAP_ADMIN_PASSWORD: admin.password,
  MUSEUM_BOOTSTRAP_ADMIN_EMAIL: 'quality-admin@example.test',
  MUSEUM_SMTP_HOST: '',
  MUSEUM_PUBLIC_BASE_URL: `http://127.0.0.1:${webPort}`,
  MUSEUM_DEV_API_URL: `http://127.0.0.1:${apiPort}`,
}
function launch(command, args, name) {
  const log = openSync(resolve(output, `${label}-${name}.log`), 'a')
  const child = spawn(command, args, { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
  child.unref()
  return child.pid
}
const configuredJava = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : undefined
const pids = [launch(configuredJava && existsSync(configuredJava) ? configuredJava : 'java', ['-Xms64m', '-Xmx384m', '-jar', jar], 'api')]
const outDir = baseline ? '../artifacts/sitewide-quality/baseline-dist' : 'dist'
pids.push(launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort', '--outDir', outDir], 'web'))
writeFileSync(metadataPath, JSON.stringify({ label, baseURL: env.MUSEUM_PUBLIC_BASE_URL, apiURL: env.MUSEUM_DEV_API_URL, admin, pids, database: env.POCKETBAY_DATA_DIR, jar, jarSha256 }, null, 2))
const deadline = Date.now() + 60000
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${env.MUSEUM_PUBLIC_BASE_URL}/api/v1/categories`, { signal: AbortSignal.timeout(2000) })
    if (response.ok && (await response.json()).data?.length) {
      console.log(`${label} environment ready: ${env.MUSEUM_PUBLIC_BASE_URL}`)
      process.exit(0)
    }
  } catch {}
  await new Promise(resolveWait => setTimeout(resolveWait, 500))
}
throw new Error(`Environment not ready; inspect ${label}-api.log and ${label}-web.log.`)
