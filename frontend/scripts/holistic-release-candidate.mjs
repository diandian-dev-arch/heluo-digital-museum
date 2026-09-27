import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Capture release inputs only. Never copies environment files, runtime data or QA credentials.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baselinePath = resolve(root, 'artifacts/sitewide-quality/heluo-quality-1789064712241-source/fingerprints.json')
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const name = `heluo-release-candidate-${Date.now()}`
const output = resolve(root, 'artifacts/holistic', name)
const snapshot = resolve(output, 'source')
const excluded = new Set(['node_modules', 'target', 'dist', '.git', 'test-results', 'playwright-report', 'coverage', 'logs', 'backups', 'uploads', 'artifacts', '.idea', '.vscode'])
const inputs = ['frontend', 'backend', 'deploy/compose.yaml', 'deploy/.env.example', 'deploy/README.md', 'deploy/scripts', 'Dockerfile', '.dockerignore', 'docker-entrypoint.sh']
const files = {}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function collect(path) {
  const stat = lstatSync(path)
  assert.ok(!stat.isSymbolicLink(), 'Release inputs must not contain symbolic links.')
  if (stat.isDirectory()) {
    for (const item of readdirSync(path)) {
      if (excluded.has(item) || item.endsWith('.log') || item.endsWith('.local') || item.endsWith('.tsbuildinfo')) continue
      if (item.startsWith('.env') && item !== '.env.example') continue
      assert.ok(!/^(?:pocketbay\.properties|.*\.(?:db|mv\.db|trace\.db|key|p12|pem)|.*\.sql\.gz)$/i.test(item), 'Unexpected runtime or private file in release input.')
      collect(resolve(path, item))
    }
  } else {
    assert.ok(stat.isFile(), 'Unsupported release file type.')
    files[relative(root, path).replaceAll('\\', '/')] = hash(path)
  }
}
for (const path of inputs) collect(resolve(root, path))
mkdirSync(snapshot, { recursive: true })
for (const [path, expected] of Object.entries(files)) {
  const destination = resolve(snapshot, path)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(resolve(root, path), destination)
  assert.equal(hash(destination), expected, `Source changed during capture: ${path}`)
}
// Re-enumerate to catch edits, additions and removals during capture, not just copied-file changes.
const original = { ...files }
for (const key of Object.keys(files)) delete files[key]
for (const path of inputs) collect(resolve(root, path))
assert.deepEqual(files, original, 'Source changed during capture. Candidate remains unverified; rerun when stable.')
const changed = Object.keys(baseline).filter(path => files[path] && files[path] !== baseline[path])
const added = Object.keys(files).filter(path => !(path in baseline))
const removed = Object.keys(baseline).filter(path => !(path in files))
const runtimeChanges = changed.filter(path => !path.includes('/scripts/') && !path.includes('/e2e/') && !/\.(?:spec|test)\./.test(path))
const manifest = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
writeFileSync(resolve(output, 'fingerprints.json'), manifestText)
const report = {
  name, capturedAt: new Date().toISOString(), snapshot, sourceStableDuringCapture: true,
  fileCount: Object.keys(files).length, manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
  baseline: relative(root, baselinePath).replaceAll('\\', '/'), changed, added, removed, runtimeChanges,
  frontendPreviewHtmlSha256: existsSync(resolve(root, 'frontend/dist/index.html')) ? hash(resolve(root, 'frontend/dist/index.html')) : null,
  state: 'captured-not-release-approved',
  limits: ['Capturing source does not prove a build or end-to-end test passed.', 'Preview HTML fingerprint alone does not prove dist was built from this source.', 'Venue identity, physical-device tests and platform release gates remain open.'],
}
writeFileSync(resolve(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ name, snapshot, fileCount: report.fileCount, runtimeChanges, added, removed, manifestSha256: report.manifestSha256 }, null, 2))
