import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface QualityEnvironment {
  label?: string
  baseURL: string
  apiURL: string
  admin: { username: string; password: string }
}

// The runner creates this ignored file with fresh local credentials on every start.
const metadata = process.env.HELUO_QUALITY_ENV_FILE
  ? resolve(process.env.HELUO_QUALITY_ENV_FILE)
  : fileURLToPath(new URL('../../artifacts/sitewide-quality/current-environment.json', import.meta.url))
export const qualityEnvironment = JSON.parse(readFileSync(metadata, 'utf8')) as QualityEnvironment
const target = new URL(qualityEnvironment.baseURL)
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('Business E2E requires the isolated loopback quality environment.')
}
