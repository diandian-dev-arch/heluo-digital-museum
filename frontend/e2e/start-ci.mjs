import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(frontend, '../artifacts/sitewide-quality')
const metadataPath = resolve(output, 'current-environment.json')
if (process.argv.includes('--stop')) {
  if (!existsSync(metadataPath)) process.exit(0)
  const { pids } = JSON.parse(readFileSync(metadataPath, 'utf8'))
  for (const pid of pids) {
    try { process.kill(pid) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  process.exit(0)
}
if (!process.env.CI || !process.env.MUSEUM_DB_URL?.startsWith('jdbc:mysql://127.0.0.1:')) {
  throw new Error('This runner requires CI and an isolated loopback MySQL database.')
}
mkdirSync(output, { recursive: true })
const admin = { username: 'quality_admin', password: randomBytes(24).toString('base64url') }
const baseURL = 'http://127.0.0.1:4189'
const apiURL = 'http://127.0.0.1:18081'
const env = {
  ...process.env,
  MUSEUM_SERVER_PORT: '18081',
  MUSEUM_JWT_SECRET: randomBytes(48).toString('base64url'),
  MUSEUM_BOOTSTRAP_ENABLED: 'true',
  MUSEUM_BOOTSTRAP_ADMIN_USERNAME: admin.username,
  MUSEUM_BOOTSTRAP_ADMIN_PASSWORD: admin.password,
  MUSEUM_BOOTSTRAP_ADMIN_EMAIL: 'quality-admin@example.test',
  MUSEUM_SMTP_HOST: '',
  MUSEUM_PUBLIC_BASE_URL: baseURL,
  MUSEUM_DEV_API_URL: apiURL,
}
function launch(command, args, label) {
  const log = openSync(resolve(output, `ci-${label}.log`), 'a')
  const child = spawn(command, args, { cwd: frontend, env, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
  child.unref()
  return child.pid
}
const pids = [
  launch('java', ['-Xms64m', '-Xmx384m', '-Dlogging.level.org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration=ERROR', '-jar', '../backend/target/museum-api-0.1.0-SNAPSHOT.jar'], 'api'),
  launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], 'web'),
]
writeFileSync(metadataPath, JSON.stringify({ baseURL, apiURL, admin, pids, database: 'isolated-ci-mysql' }, null, 2))
const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${baseURL}/api/v1/ready`, { signal: AbortSignal.timeout(2000) })
    if (response.ok && (await response.json()).data?.status === 'UP') {
      const authentication = await fetch(`${baseURL}/api/v1/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin), signal: AbortSignal.timeout(3000),
      })
      if (authentication.ok) {
        console.log(`Isolated MySQL business environment ready: ${baseURL}`)
        process.exit(0)
      }
    }
  } catch {}
  await new Promise(resolveWait => setTimeout(resolveWait, 500))
}
throw new Error('Isolated MySQL environment did not become ready; inspect the CI service logs.')
