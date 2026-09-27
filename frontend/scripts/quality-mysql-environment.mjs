import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(frontend, '../artifacts/sitewide-quality')
const metadataPath = resolve(output, 'mysql-environment.json')
function executableOnPath(name) {
  const result = spawnSync('where.exe', [name], { windowsHide: true, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/).find(path => existsSync(path)) : undefined
}
const mysqlServer = executableOnPath('mysqld.exe')
const mysqlClient = executableOnPath('mysql.exe')
const mysqlBin = mysqlServer ? dirname(mysqlServer) : ''
const mysqlPort = 13306
const apiPort = 18082
const webPort = 4192

function runMysql(sql, password = '') {
  return new Promise((resolveQuery, reject) => {
    const child = spawn(mysqlClient, [
      '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${mysqlPort}`,
      '--user=root', '--connect-timeout=3', '--default-character-set=utf8mb4', '--batch', '--skip-column-names',
    ], { env: { ...process.env, MYSQL_PWD: password }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.on('data', value => { stdout += value.toString() })
    child.stderr.resume()
    child.once('error', reject)
    child.stdin.on('error', () => {})
    child.once('close', code => code === 0 ? resolveQuery(stdout) : reject(new Error(`Isolated MySQL client exited ${code}.`)))
    child.stdin.end(sql)
  })
}

async function stop(metadata) {
  const pidFile = metadata.database.nativePath && resolve(metadata.database.nativePath, 'mysql-server.pid')
  if (pidFile && existsSync(pidFile)) {
    const serverPid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isSafeInteger(serverPid) && serverPid > 0) metadata.mysqlPid = serverPid
  }
  const candidatePids = [...new Set([...metadata.pids, metadata.mysqlPid])]
    .filter(pid => Number.isSafeInteger(pid) && pid > 0)
  if (!candidatePids.length) return
  const processes = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); Get-CimInstance Win32_Process -Filter '${candidatePids.map(pid => `ProcessId = ${pid}`).join(' OR ')}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`,
  ], { windowsHide: true, encoding: 'utf8' })
  if (processes.status !== 0) throw new Error('Could not verify isolated process ownership; no processes were stopped.')
  const rows = processes.stdout.trim() ? JSON.parse(processes.stdout) : []
  const expectedPaths = [metadata.jar, metadata.dist, metadata.database.nativePath]
    .filter(Boolean).map(path => path.replaceAll('\\', '/').toLowerCase())
  // PID values can be reused after a previous run; require its unique snapshot or data path too.
  const processRows = Array.isArray(rows) ? rows : [rows]
  const ownedPids = new Set(processRows.filter(row => {
    const command = (row.CommandLine ?? '').replaceAll('\\', '/').toLowerCase()
    return expectedPaths.some(path => command.includes(path))
  }).map(row => row.ProcessId))
  const databasePath = metadata.database.nativePath?.replaceAll('\\', '/').toLowerCase()
  const databasePids = new Set(processRows.filter(row => databasePath
    && (row.CommandLine ?? '').replaceAll('\\', '/').toLowerCase().includes(databasePath)).map(row => row.ProcessId))
  for (const pid of metadata.pids.filter(pid => !databasePids.has(pid) && ownedPids.has(pid))) {
    try { process.kill(pid) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  if (metadata.mysqlPid && ownedPids.has(metadata.mysqlPid)) {
    try { await runMysql('SHUTDOWN;\n', metadata.database.rootPassword ?? '') }
    catch {
      try { process.kill(metadata.mysqlPid) } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  for (const pid of metadata.pids.filter(pid => pid !== metadata.mysqlPid && databasePids.has(pid))) {
    try { process.kill(pid) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}

if (process.argv.includes('--stop')) {
  if (!existsSync(metadataPath)) process.exit(0)
  await stop(JSON.parse(readFileSync(metadataPath, 'utf8')))
  console.log('Stopped isolated MySQL quality environment; data has been preserved.')
  process.exit(0)
}

if (process.platform !== 'win32' || !mysqlServer || !mysqlClient) {
  throw new Error('This local runner requires mysqld.exe and mysql.exe on the Windows PATH.')
}
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/java.exe') : ''
if (!java || !existsSync(java)) throw new Error('Set JAVA_HOME to the installed Java 17 directory.')
const javaVersion = spawnSync(java, ['-version'], { windowsHide: true, encoding: 'utf8' })
if (javaVersion.status !== 0 || !/version "17(?:\.|\")/.test(javaVersion.stderr)) {
  throw new Error('JAVA_HOME must point to Java 17 for this verification environment.')
}
const sourceJar = resolve(frontend, '../backend/target/museum-api-0.1.0-SNAPSHOT.jar')
const sourceDist = resolve(frontend, 'dist')
if (!existsSync(sourceJar) || !existsSync(resolve(sourceDist, 'index.html'))) {
  throw new Error('Build the backend and frontend before starting the isolated MySQL environment.')
}
for (const port of [mysqlPort, apiPort, webPort]) {
  await new Promise((resolveCheck, reject) => {
    const probe = createServer()
    probe.once('error', () => reject(new Error(`Port ${port} is occupied; no existing service was stopped.`)))
    probe.listen(port, '127.0.0.1', () => probe.close(resolveCheck))
  })
}

const runId = Date.now()
const label = `mysql-${runId}`
const dataDirectory = resolve(output, `mysql-data-${runId}`).replaceAll('\\', '/')
const mysqlDataPath = resolve(tmpdir(), `heluo-mysql-quality-${runId}`).replaceAll('\\', '/')
const jar = resolve(output, `${label}-api.jar`)
const dist = resolve(output, `${label}-dist`)
mkdirSync(output, { recursive: true })
mkdirSync(mysqlDataPath)
// Keep an artifacts entry while using an ASCII physical path for the native Windows server.
symlinkSync(mysqlDataPath, dataDirectory, 'junction')
copyFileSync(sourceJar, jar)
cpSync(sourceDist, dist, { recursive: true, errorOnExist: true, force: false })
const admin = { username: 'quality_admin', password: randomBytes(24).toString('base64url') }
const database = {
  name: 'museum_quality', username: 'quality_user', password: randomBytes(24).toString('base64url'),
  rootPassword: '', port: mysqlPort, directory: dataDirectory, nativePath: mysqlDataPath,
}
const env = {
  ...process.env,
  SPRING_PROFILES_ACTIVE: '',
  MUSEUM_SERVER_PORT: String(apiPort),
  MUSEUM_DB_URL: `jdbc:mysql://127.0.0.1:${mysqlPort}/${database.name}?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true`,
  MUSEUM_DB_USERNAME: database.username,
  MUSEUM_DB_PASSWORD: database.password,
  MUSEUM_JWT_SECRET: randomBytes(48).toString('base64url'),
  MUSEUM_BOOTSTRAP_ENABLED: 'true',
  MUSEUM_BOOTSTRAP_ADMIN_USERNAME: admin.username,
  MUSEUM_BOOTSTRAP_ADMIN_PASSWORD: admin.password,
  MUSEUM_BOOTSTRAP_ADMIN_EMAIL: 'quality-admin@example.test',
  MUSEUM_SMTP_HOST: '',
  MUSEUM_PUBLIC_BASE_URL: `http://127.0.0.1:${webPort}`,
  MUSEUM_DEV_API_URL: `http://127.0.0.1:${apiPort}`,
}
const metadata = {
  label: 'mysql', baseURL: env.MUSEUM_PUBLIC_BASE_URL, apiURL: env.MUSEUM_DEV_API_URL, admin, database,
  pids: [], mysqlPid: null, jar, dist,
  jarSha256: createHash('sha256').update(readFileSync(jar)).digest('hex'),
  webIndexSha256: createHash('sha256').update(readFileSync(resolve(dist, 'index.html'))).digest('hex'),
}
const saveMetadata = () => writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

async function launch(command, args, name, waitForExit = false, workingDirectory = frontend) {
  const log = openSync(resolve(output, `${label}-${name}.log`), 'a')
  const child = spawn(command, args, { cwd: workingDirectory, env, detached: !waitForExit, windowsHide: true, stdio: ['ignore', log, log] })
  if (waitForExit) {
    await new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolveExit() : reject(new Error(`${name} exited ${code}; inspect its isolated log.`)))
    })
    return child.pid
  }
  child.unref()
  metadata.pids.push(child.pid)
  saveMetadata()
  return child.pid
}

const mysqlBase = ['--no-defaults', `--basedir=${resolve(mysqlBin, '..')}`, `--datadir=${mysqlDataPath}`]
try {
  saveMetadata()
  console.log('Initializing a new isolated MySQL data directory.')
  await launch(mysqlServer, [...mysqlBase, '--initialize-insecure', '--console'], 'initialize', true, mysqlDataPath)
  metadata.mysqlPid = await launch(mysqlServer, [
    ...mysqlBase, '--standalone', `--port=${mysqlPort}`, '--bind-address=127.0.0.1', '--mysqlx=OFF',
    `--log-error=${mysqlDataPath}/mysql-server.err`, `--pid-file=${mysqlDataPath}/mysql-server.pid`,
    '--innodb-buffer-pool-size=134217728', '--max-connections=30', '--performance-schema=OFF',
    '--skip-log-bin', '--default-time-zone=+00:00',
  ], 'server', false, mysqlDataPath)
  saveMetadata()
  const mysqlDeadline = Date.now() + 60_000
  let mysqlReady = false
  while (Date.now() < mysqlDeadline) {
    const pidFile = resolve(mysqlDataPath, 'mysql-server.pid')
    if (existsSync(pidFile)) {
      const serverPid = Number(readFileSync(pidFile, 'utf8').trim())
      if (Number.isSafeInteger(serverPid) && serverPid > 0) { metadata.mysqlPid = serverPid; saveMetadata() }
    }
    try { mysqlReady = (await runMysql('SELECT 1;\n')).trim() === '1'; if (mysqlReady) break } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  if (!mysqlReady) throw new Error('The isolated MySQL server did not become ready.')
  const actualPidFile = resolve(mysqlDataPath, 'mysql-server.pid')
  if (existsSync(actualPidFile)) metadata.mysqlPid = Number(readFileSync(actualPidFile, 'utf8').trim())
  const rootPassword = randomBytes(24).toString('base64url')
  // Credentials use the base64url alphabet and are supplied only through stdin.
  await runMysql(`CREATE DATABASE museum_quality CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'quality_user'@'127.0.0.1' IDENTIFIED BY '${database.password}';
CREATE USER 'quality_user'@'localhost' IDENTIFIED BY '${database.password}';
GRANT ALL PRIVILEGES ON museum_quality.* TO 'quality_user'@'127.0.0.1';
GRANT ALL PRIVILEGES ON museum_quality.* TO 'quality_user'@'localhost';
ALTER USER 'root'@'localhost' IDENTIFIED BY '${rootPassword}';\n`)
  database.rootPassword = rootPassword
  saveMetadata()
  await launch(java, ['-Xms64m', '-Xmx384m', '-Dlogging.level.org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration=ERROR', '-jar', jar], 'api')
  await launch(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort', '--outDir', dist], 'web')
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${metadata.baseURL}/api/v1/ready`, { signal: AbortSignal.timeout(2000) })
      if (response.ok && (await response.json()).data?.status === 'UP') {
        const authentication = await fetch(`${metadata.baseURL}/api/v1/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(admin), signal: AbortSignal.timeout(3000),
        })
        if (authentication.ok) {
          console.log(`Isolated MySQL quality environment ready: ${metadata.baseURL}`)
          process.exit(0)
        }
      }
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  throw new Error('MySQL application did not become ready; inspect the isolated API and web logs.')
} catch (error) {
  await stop(metadata)
  throw error
}
