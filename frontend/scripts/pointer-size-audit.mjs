import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const outputPath = resolve(root, '..', 'artifacts', 'performance', 'pointer-size.json')
const virtualEntry = 'virtual:heluo-pointer-size-audit'
const resolvedVirtualEntry = `\0${virtualEntry}`
const result = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  plugins: [
    vue(),
    {
      name: 'heluo-pointer-size-audit-entry',
      resolveId(id) {
        return id === virtualEntry ? resolvedVirtualEntry : undefined
      },
      load(id) {
        if (id !== resolvedVirtualEntry) return undefined
        return [
          "import PointerCursor from '/src/components/PointerCursor.vue'",
          "import { pointerSurface } from '/src/directives/pointerSurface.ts'",
          "import '/src/assets/pointer-motion.css'",
          'export { PointerCursor, pointerSurface }',
        ].join('\n')
      },
    },
  ],
  build: {
    write: false,
    minify: 'esbuild',
    cssMinify: 'esbuild',
    rollupOptions: {
      input: virtualEntry,
      external: ['vue'],
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: 'pointer-interaction.js',
      },
    },
  },
})

const builds = Array.isArray(result) ? result : [result]
const outputs = builds.flatMap((item) => item.output)
const js = outputs
  .filter((item) => item.type === 'chunk')
  .map((item) => item.code)
  .join('\n')
const css = outputs
  .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
  .map((item) => typeof item.source === 'string' ? item.source : Buffer.from(item.source).toString('utf8'))
  .join('\n')

const measure = (source) => ({
  minifiedBytes: Buffer.byteLength(source),
  gzipBytes: gzipSync(source).byteLength,
})
const summary = {
  generatedAt: new Date().toISOString(),
  budgets: {
    jsMinifiedBytes: 12_000,
    jsGzipBytes: 5_000,
  },
  js: measure(js),
  css: measure(css),
  gates: {
    noLayoutPropertyTransitions: !/transition[^;}]*\b(?:width|height)\b/.test(css),
  },
}
summary.passed = summary.js.minifiedBytes <= summary.budgets.jsMinifiedBytes
  && summary.js.gzipBytes <= summary.budgets.jsGzipBytes
  && Object.values(summary.gates).every(Boolean)

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(summary, null, 2))
if (!summary.passed) process.exitCode = 1
