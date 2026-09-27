import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { qualityEnvironment } from './e2e/environment'

const reportName = qualityEnvironment.label === 'mysql' ? 'business-mysql-results'
  : qualityEnvironment.label === 'docker' ? 'business-docker-results'
    : qualityEnvironment.label === 'pocketbay-local' ? 'business-pocketbay-results' : 'business-results'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  outputDir: `../artifacts/sitewide-quality/${reportName}`,
  reporter: [
    ['list'],
    ['json', { outputFile: `../artifacts/sitewide-quality/${reportName}.json` }],
  ],
  use: {
    baseURL: qualityEnvironment.baseURL,
    browserName: 'chromium',
    launchOptions: existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {},
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
})
