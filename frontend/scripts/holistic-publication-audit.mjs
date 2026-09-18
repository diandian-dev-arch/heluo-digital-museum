import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Public API does not expose publication timestamps. Read only the isolated content tables.
const environment = JSON.parse(await readFile(resolve('../artifacts/sitewide-quality/docker-environment.json'), 'utf8'))
assert.match(environment.projectName, /^heluo-quality-\d+$/)
const output = resolve('../artifacts/holistic', `publication-${Date.now()}`)
await mkdir(output, { recursive: true })
const records = []
for (const table of ['artifacts', 'articles', 'exhibits_3d', 'products']) {
  const sql = `SELECT JSON_OBJECT('kind','${table}','slug',slug,'status',status,'publishedAt',published_at,'deletedAt',deleted_at,'coverAssetRef',cover_asset_ref) FROM ${table} WHERE status='PUBLISHED' AND deleted_at IS NULL ORDER BY id`
  // Shell references existing container environment. Password values never enter host argv or output.
  const command = 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" "$MYSQL_DATABASE" --batch --raw --skip-column-names --execute="$1"'
  const { stdout } = await promisify(execFile)('docker', ['exec', `${environment.projectName}-mysql-1`, 'sh', '-c', command, 'content-audit', sql], { windowsHide: true, timeout: 15000 })
  for (const line of stdout.trim().split('\n').filter(Boolean)) records.push(JSON.parse(line))
}
assert.equal(records.filter(item => item.kind === 'artifacts').length, 6)
assert.ok(records.every(item => item.status === 'PUBLISHED' && item.deletedAt === null))
const missingPublicationDates = records.filter(item => item.publishedAt === null).map(item => `${item.kind}/${item.slug}`)
const evidence = { timestamp: new Date().toISOString(), project: environment.projectName,
  scope: 'Isolated database publication metadata; dates are local initialization/publication times, not historical artifact dates or production release dates.',
  records, missingPublicationDates, passed: missingPublicationDates.length === 0 }
await writeFile(resolve(output, 'inventory.json'), JSON.stringify(evidence, null, 2))
assert.equal(missingPublicationDates.length, 0, 'Published records lack publication dates.')
console.log(JSON.stringify({ output, passed: true, records: records.length }))
