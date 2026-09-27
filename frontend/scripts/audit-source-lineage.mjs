import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve('..')
const baseline = resolve(root, 'artifacts/holistic/heluo-release-candidate-1789095823227/source')
const output = resolve(root, 'artifacts/premium-visual-2026-09-12/source-lineage')
const hash = data => createHash('sha256').update(data).digest('hex')
async function paths(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) found.push(...await paths(path))
    else if (!/\.spec\.ts$/.test(entry.name) && !path.includes('/src/test/') && !path.includes('\\src\\test\\')) found.push(path)
  }
  return found
}
const oldPaths = (await paths(resolve(baseline, 'frontend/src'))).map(p => relative(baseline, p).replaceAll('\\', '/'))
const newPaths = (await paths(resolve(root, 'frontend/src'))).map(p => relative(root, p).replaceAll('\\', '/'))
const rows = []
for (const path of [...new Set([...oldPaths, ...newPaths])].sort()) {
  const old = await readFile(resolve(baseline, path)).catch(() => null)
  const current = await readFile(resolve(root, path)).catch(() => null)
  const normalize = bytes => /\.(vue|css|ts|json|svg)$/.test(path) ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes
  rows.push({ path, state: !old ? 'added' : !current ? 'removed' : hash(normalize(old)) === hash(normalize(current)) ? 'same' : 'changed', baselineHash: old && hash(old), currentHash: current && hash(current) })
}
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ baseline, scope: 'Runtime src files, tests excluded; textual CRLF normalized for equivalence. Does not prove backend/data/public assets equivalence or replay historical browser checks.', rows }, null, 2))
console.log(JSON.stringify({ same: rows.filter(r => r.state === 'same').length, differences: rows.filter(r => r.state !== 'same').map(({ path, state }) => ({ path, state })) }, null, 2))
