import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(root, 'artifacts/sitewide-quality')
const hash = data => createHash('sha256').update(data).digest('hex')
const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--',
  'frontend/src', 'frontend/scripts', 'frontend/public', 'backend/src',
  'frontend/package.json', 'frontend/pnpm-lock.yaml', 'backend/pom.xml', '.github/workflows/ci.yml',
], { cwd: root }).toString('utf8').split('\0').filter(Boolean))].sort()
const sources = []
for (const path of files) sources.push({ path, sha256: hash(await readFile(resolve(root, path))) })

async function directoryFingerprint(directory) {
  if (!existsSync(directory)) return null
  const items = []
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = resolve(path, entry.name)
      if (entry.isDirectory()) await visit(target)
      else items.push({ path: relative(directory, target).replaceAll('\\', '/'), sha256: hash(await readFile(target)) })
    }
  }
  await visit(directory)
  items.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  return { sha256: hash(JSON.stringify(items)), files: items.length }
}

const environments = []
for (const name of ['baseline', 'current', 'mysql', 'production']) {
  const path = resolve(output, `${name}-environment.json`)
  if (!existsSync(path)) continue
  const env = JSON.parse(await readFile(path, 'utf8'))
  // Publish an explicit allowlist; environment files also contain private credentials.
  environments.push({ name, baseURL: env.baseURL, jarSha256: env.jar && existsSync(env.jar) ? hash(await readFile(env.jar)) : env.jarSha256 })
}
const manifest = {
  timestamp: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  worktreeDirty: true,
  sourceFingerprint: hash(JSON.stringify(sources)),
  sources,
  currentDist: await directoryFingerprint(resolve(root, 'frontend/dist')),
  baselineDist: await directoryFingerprint(resolve(output, 'baseline-dist')),
  environments,
  limitations: 'Local dirty-worktree evidence only. No deployed-version equivalence is claimed.',
}
await writeFile(resolve(output, 'version-evidence.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ sourceFiles: sources.length, sourceFingerprint: manifest.sourceFingerprint, currentDist: manifest.currentDist }))
