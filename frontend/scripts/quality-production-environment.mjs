import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { closeSync, constants, copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(frontend, '../artifacts/sitewide-quality')
const metadataPath = resolve(output, 'production-environment.json')
const port = 4191
const baseURL = `http://127.0.0.1:${port}`
mkdirSync(output, { recursive: true })

async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function describeDist(directory, relative = '') {
  const files = []
  for (const entry of readdirSync(resolve(directory, relative), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await describeDist(directory, path))
    else if (entry.isFile()) files.push({ path, bytes: statSync(resolve(directory, path)).size, sha256: await digest(resolve(directory, path)) })
    else throw new Error(`Unexpected non-file build entry: ${path}`)
  }
  return files
}

function request(path, headers = {}) {
  return new Promise((resolveRequest, reject) => {
    const outgoing = http.get(`${baseURL}${path}`, { headers }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => resolveRequest({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }))
    })
    outgoing.setTimeout(15000, () => outgoing.destroy(new Error(`HTTP timeout: ${path}`)))
    outgoing.on('error', reject)
  })
}

function describeResponse(response) {
  return { status: response.status, cacheControl: response.headers['cache-control'], contentType: response.headers['content-type'], contentEncoding: response.headers['content-encoding'], contentLength: response.headers['content-length'], contentRange: response.headers['content-range'], acceptRanges: response.headers['accept-ranges'], requestId: response.headers['x-request-id'], wireBytes: response.body.length }
}

if (process.argv.includes('--stop')) {
  if (!existsSync(metadataPath)) process.exit(0)
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  for (const pid of metadata.pids ?? []) {
    assert.ok(Number.isSafeInteger(pid) && pid > 0)
    if (process.platform !== 'win32') throw new Error('Owned-process verification for --stop currently requires Windows.')
    const command = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -ExpandProperty CommandLine`], { encoding: 'utf8', windowsHide: true }).trim()
    if (!command) continue
    if (!command.includes(basename(metadata.jar))) throw new Error(`PID ${pid} no longer belongs to this environment; refusing to stop it.`)
    try { process.kill(pid) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  metadata.status = 'stopped'
  metadata.stoppedAt = new Date().toISOString()
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  console.log('Stopped the owned production quality process; its artifacts and database are preserved.')
  process.exit(0)
}

await new Promise((resolvePort, reject) => {
  const probe = net.createServer()
  probe.once('error', () => reject(new Error(`Port ${port} is in use. Existing services were not changed.`)))
  probe.listen({ port, host: '127.0.0.1', exclusive: true }, () => probe.close(resolvePort))
})

const javaHome = process.env.JAVA_HOME
if (!javaHome) throw new Error('Set JAVA_HOME to the existing Java 17 installation before running this script.')
const java = resolve(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
const jarTool = resolve(javaHome, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar')
assert.ok(existsSync(java) && existsSync(jarTool), 'JAVA_HOME must contain both java and jar tools.')
const javaVersion = execFileSync(java, ['--version'], { encoding: 'utf8', windowsHide: true })
assert.match(javaVersion, /(?:openjdk|java) 17(?:\.|\s)/, 'This environment requires Java 17.')

const sourceJar = resolve(frontend, '../backend/target/museum-api-0.1.0-SNAPSHOT.jar')
const dist = resolve(frontend, 'dist')
assert.ok(existsSync(sourceJar), 'Build the current backend JAR before starting.')
assert.ok(existsSync(resolve(dist, 'index.html')), 'Build the current frontend before starting.')
const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`
const staging = resolve(output, `production-package-${stamp}`)
const jar = resolve(output, `production-api-${stamp}.jar`)
const database = resolve(output, `production-data-${stamp}`).replaceAll('\\', '/')
const logPath = resolve(output, `production-api-${stamp}.log`)
const sourceJarSha256 = await digest(sourceJar)
const distFiles = await describeDist(dist)
const distSha256 = createHash('sha256').update(JSON.stringify(distFiles)).digest('hex')
const sourceIndex = distFiles.find(file => file.path === 'index.html')
const script = distFiles.find(file => /^assets\/index-[A-Za-z0-9_-]+\.js$/.test(file.path) && file.bytes >= 1024)
const model = distFiles.find(file => file.path.startsWith('media/') && file.path.endsWith('.glb') && file.bytes >= 1024)
assert.ok(script && model, 'The build must include a main JavaScript entry and a GLB model for HTTP verification.')

mkdirSync(resolve(staging, 'BOOT-INF/classes'), { recursive: true })
cpSync(dist, resolve(staging, 'BOOT-INF/classes/static'), { recursive: true, errorOnExist: true, force: false })
copyFileSync(sourceJar, jar, constants.COPYFILE_EXCL)
execFileSync(jarTool, ['--update', '--file', jar, '-C', staging, 'BOOT-INF/classes/static'], { windowsHide: true, stdio: 'pipe' })
assert.equal(await digest(sourceJar), sourceJarSha256, 'The original backend JAR changed while packaging.')
assert.equal(createHash('sha256').update(JSON.stringify(await describeDist(dist))).digest('hex'), distSha256, 'The frontend build changed while packaging. Run again after the build is stable.')

const admin = { username: 'quality_production_admin', password: randomBytes(24).toString('base64url') }
const env = {
  ...process.env,
  SPRING_PROFILES_ACTIVE: 'pocketbay',
  SERVER_ADDRESS: '127.0.0.1',
  PORT: String(port),
  SERVER_PORT: String(port),
  POCKETBAY_DATA_DIR: database,
  SPRING_DATASOURCE_URL: `jdbc:h2:file:${database}/museum;MODE=MySQL;DB_CLOSE_ON_EXIT=FALSE`,
  SPRING_DATASOURCE_DRIVER_CLASS_NAME: 'org.h2.Driver',
  SPRING_DATASOURCE_USERNAME: 'sa',
  SPRING_DATASOURCE_PASSWORD: '',
  MUSEUM_DB_USERNAME: 'sa',
  MUSEUM_DB_PASSWORD: '',
  MUSEUM_JWT_SECRET: randomBytes(48).toString('base64url'),
  MUSEUM_BOOTSTRAP_ENABLED: 'true',
  MUSEUM_BOOTSTRAP_ADMIN_USERNAME: admin.username,
  MUSEUM_BOOTSTRAP_ADMIN_PASSWORD: admin.password,
  MUSEUM_BOOTSTRAP_ADMIN_EMAIL: 'quality-production-admin@example.test',
  MUSEUM_SMTP_HOST: '',
  SPRING_MAIL_HOST: '',
  MUSEUM_PUBLIC_BASE_URL: baseURL,
}
const log = openSync(logPath, 'a')
const child = spawn(java, ['-Xms64m', '-Xmx384m', '-jar', jar], { cwd: frontend, env, detached: true, windowsHide: true, stdio: ['ignore', log, log] })
await once(child, 'spawn')
closeSync(log)
child.unref()
const metadata = {
  label: 'production', status: 'starting', startedAt: new Date().toISOString(), baseURL, apiURL: baseURL, admin,
  pids: [child.pid], database, logPath, java, javaVersion: javaVersion.trim(), sourceJar, sourceJarSha256,
  jar, jarSha256: await digest(jar), staging, dist, distSha256, distFiles,
  server: 'Spring Boot pocketbay profile; embedded current frontend; loopback-only; isolated H2; SMTP disabled',
}
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

try {
  let ready
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Java exited before readiness; inspect ${logPath}`)
    try {
      ready = await request('/api/v1/ready')
      if (ready.status === 200 && JSON.parse(ready.body.toString('utf8')).data?.status === 'UP') break
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  assert.equal(ready?.status, 200, `Readiness did not succeed; inspect ${logPath}`)
  assert.equal(JSON.parse(ready.body.toString('utf8')).data?.status, 'UP')
  assert.match(ready.headers['cache-control'] ?? '', /no-store/)

  const homepage = await request('/', { 'Accept-Encoding': 'gzip' })
  assert.equal(homepage.status, 200)
  assert.match(homepage.headers['cache-control'] ?? '', /no-cache/)
  const html = homepage.headers['content-encoding'] === 'gzip' ? gunzipSync(homepage.body) : homepage.body
  assert.equal(createHash('sha256').update(html).digest('hex'), sourceIndex.sha256, 'The served HTML must match the current dist exactly.')

  const asset = await request(`/${script.path}`, { 'Accept-Encoding': 'gzip' })
  assert.equal(asset.status, 200)
  assert.equal(asset.headers['content-encoding'], 'gzip')
  assert.equal(asset.body[0], 0x1f)
  assert.equal(asset.body[1], 0x8b)
  assert.equal(createHash('sha256').update(gunzipSync(asset.body)).digest('hex'), script.sha256)
  assert.match(asset.headers['cache-control'] ?? '', /max-age=31536000/)
  assert.match(asset.headers['cache-control'] ?? '', /immutable/)

  const range = await request(`/${model.path}`, { Range: 'bytes=0-1023', 'Accept-Encoding': 'identity' })
  assert.equal(range.status, 206)
  assert.equal(range.headers['content-range'], `bytes 0-1023/${model.bytes}`)
  assert.equal(range.body.length, 1024)
  assert.match(range.headers['cache-control'] ?? '', /max-age=(?:86400|31536000)/)

  const unknownPath = '/quality-production-missing-page'
  const unknown = await request(unknownPath, { Accept: 'text/html', 'Accept-Encoding': 'identity' })
  const checks = {
    ready: describeResponse(ready), homepage: { ...describeResponse(homepage), matchesDist: true },
    javascript: { path: script.path, ...describeResponse(asset), matchesDist: true, decodedBytes: script.bytes },
    modelRange: { path: model.path, ...describeResponse(range) },
    unknownPublicRoute: { path: unknownPath, ...describeResponse(unknown), servesVueShell: createHash('sha256').update(unknown.body).digest('hex') === sourceIndex.sha256 },
  }
  metadata.status = 'ready'
  metadata.readyAt = new Date().toISOString()
  metadata.checks = checks
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  console.log(`Production quality environment ready: ${baseURL}`)
  console.log(`Verified current HTML, gzip JavaScript, immutable asset cache, no-store readiness, and GLB Range 206. Metadata: ${metadataPath}`)
  console.log(`Unknown public route: HTTP ${unknown.status}; Vue shell=${checks.unknownPublicRoute.servesVueShell}.`)
} catch (error) {
  metadata.status = 'failed'
  metadata.failure = error.message
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  child.kill()
  throw error
}
