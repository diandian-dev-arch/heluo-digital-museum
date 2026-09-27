import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Local rehearsal only. The source is read-only; a new isolated schema is retained.
const environment = JSON.parse(await readFile(resolve('../artifacts/sitewide-quality/docker-environment.json'), 'utf8'))
assert.match(environment.projectName, /^heluo-quality-\d+$/)
assert.equal(environment.environment.MYSQL_DATABASE, 'museum_quality')
const container = `${environment.projectName}-mysql-1`
const runId = Date.now()
const restoredDatabase = `museum_restore_${runId}`
const output = resolve('../artifacts/holistic', `restore-${runId}`)
await mkdir(output, { recursive: true })
const exec = promisify(execFile)
const options = { windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }
const { stdout: projectLabel } = await exec('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', container], options)
assert.equal(projectLabel.toString().trim(), environment.projectName)
const mysql = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot --batch --raw --skip-column-names --execute="$1"'
async function query(sql) {
  const { stdout } = await exec('docker', ['exec', container, 'sh', '-c', mysql, 'restore-audit', sql], options)
  return stdout.toString().trim()
}
assert.equal(await query(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${restoredDatabase}'`), '0')
const dumpCommand = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --default-character-set=utf8mb4 --single-transaction --no-tablespaces --set-gtid-purged=OFF --skip-comments --order-by-primary --hex-blob --skip-add-drop-table --skip-add-locks --skip-lock-tables "$1"'
async function dump(database) {
  const { stdout } = await exec('docker', ['exec', container, 'sh', '-c', dumpCommand, 'restore-audit', database], options)
  return stdout
}
const sourceDump = await dump('museum_quality')
assert.ok(sourceDump.length > 1000, 'Unexpectedly empty database backup.')
// The ignored backup includes local account hashes and test data; never print or publish it.
await writeFile(resolve(output, 'isolated-backup.sql'), sourceDump, { flag: 'wx' })
const sourceCollation = await query("SELECT default_collation_name FROM information_schema.schemata WHERE schema_name='museum_quality'")
assert.match(sourceCollation, /^utf8mb4_[a-z0-9_]+$/)
await query(`CREATE DATABASE ${restoredDatabase} CHARACTER SET utf8mb4 COLLATE ${sourceCollation}`)
const evidence = { scope: 'Local isolated MySQL logical backup restoration; not production recovery or application recovery.',
  timestamp: new Date().toISOString(), project: environment.projectName, restoredDatabase, sourceCollation, passed: false }
try {
  await new Promise((done, reject) => {
    const command = 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --default-character-set=utf8mb4 -uroot "$1"'
    const child = spawn('docker', ['exec', '-i', container, 'sh', '-c', command, 'restore-audit', restoredDatabase], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], timeout: 120000 })
    child.once('error', reject)
    child.stdin.once('error', reject)
    child.once('close', code => code === 0 ? done() : reject(new Error(`Restore failed (${code}); retained backup and new schema for inspection.`)))
    child.stdin.end(sourceDump)
  })
  const restoredDump = await dump(restoredDatabase)
  const hash = buffer => createHash('sha256').update(buffer).digest('hex')
  evidence.backupBytes = sourceDump.length
  evidence.backupSha256 = hash(sourceDump)
  evidence.restoredSha256 = hash(restoredDump)
  // MySQL may expand a column's COLLATE into CHARACTER SET plus COLLATE on re-creation.
  // Only this redundant DDL declaration is canonicalized; INSERT data is untouched.
  const canonicalize = buffer => buffer.toString('utf8').split('\n').map(line =>
    /^  `[^`]+` /.test(line) ? line.replace(/ CHARACTER SET utf8mb4 COLLATE (utf8mb4_[a-z0-9_]+)/g, ' COLLATE $1') : line).join('\n')
  evidence.canonicalBackupSha256 = hash(canonicalize(sourceDump))
  evidence.canonicalRestoredSha256 = hash(canonicalize(restoredDump))
  evidence.tableCount = Number(await query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${restoredDatabase}' AND table_type='BASE TABLE'`))
  evidence.successfulMigrations = Number(await query(`SELECT COUNT(*) FROM ${restoredDatabase}.flyway_schema_history WHERE success=1`))
  assert.ok(evidence.tableCount > 0)
  assert.equal(evidence.canonicalRestoredSha256, evidence.canonicalBackupSha256, 'Restored schema/data dump differs from the backup after equivalent charset declarations are normalized.')
  evidence.passed = true
} finally {
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ output, ...evidence }))
}
