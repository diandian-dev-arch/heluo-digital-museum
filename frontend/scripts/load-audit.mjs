import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))
const root = resolve(scripts, '../..')
const bundled = resolve(root, 'artifacts/testing-tools/k6-v2.2.0/k6-v2.2.0-windows-amd64/k6.exe')
const executable = process.argv[2] || (existsSync(bundled) ? bundled : 'k6')
const output = resolve(root, `artifacts/open-source-testing/k6-${Date.now()}`)
mkdirSync(output, { recursive: true })
const result = spawnSync(executable, ['run', '--quiet', '--summary-export', resolve(output, 'summary.json'), resolve(scripts, 'public-load.k6.js')], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000,
})
writeFileSync(resolve(output, 'run.log'), `${result.stdout || ''}\n${result.stderr || ''}`)
console.log(result.stdout || '')
if (result.error) console.error(result.error.message)
if (result.status !== 0) console.error(result.stderr || 'k6 did not complete successfully.')
console.log(`k6 reports: ${output}`)
process.exitCode = result.status === 0 ? 0 : 1
