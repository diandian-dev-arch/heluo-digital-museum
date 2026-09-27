import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const isVitest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'

export default defineConfig({
  // JSDOM does not need Vite's production asset URL imports. Keeping the
  // transform disabled only in Vitest also lets view-level tests mount pages
  // that use root-relative public assets without asking Node to load them.
  plugins: [vue(isVitest ? { template: { transformAssetUrls: false } } : {})],
  server: {
    proxy: {
      '/api': process.env.MUSEUM_DEV_API_URL ?? 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
