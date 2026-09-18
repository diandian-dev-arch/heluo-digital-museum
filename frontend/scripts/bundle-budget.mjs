import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const distDir = resolve(process.cwd(), 'dist')
const indexPath = resolve(distDir, 'index.html')
const MAX_INITIAL_CSS_GZIP_BYTES = 80_000

if (!existsSync(indexPath)) throw new Error('未找到 dist/index.html，请先运行 Vite build。')

const indexHtml = readFileSync(indexPath, 'utf8')
const initialCssFiles = [...indexHtml.matchAll(/href="\/?([^"?]+\.css)(?:\?[^"#]*)?"/g)]
  .map((match) => match[1])
  .filter((value, index, values) => values.indexOf(value) === index)

const initialCssGzipBytes = initialCssFiles.reduce((total, relativePath) => {
  const file = resolve(distDir, relativePath)
  if (!existsSync(file)) throw new Error(`首页引用的 CSS 不存在：${relativePath}`)
  return total + gzipSync(readFileSync(file)).byteLength
}, 0)

function findFiles(directory, extension) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? findFiles(path, extension) : path.endsWith(extension) ? [path] : []
  })
}

const fontFiles = findFiles(distDir, '.woff2')
const budget = JSON.parse(readFileSync(new URL('./resource-budget.json', import.meta.url), 'utf8'))
const gzipTotal = (extension) => findFiles(resolve(distDir, 'assets'), extension)
  .reduce((total, path) => total + gzipSync(readFileSync(path)).byteLength, 0)
const summary = {
  initialCssFiles,
  initialCssGzipBytes,
  initialCssBudgetBytes: MAX_INITIAL_CSS_GZIP_BYTES,
  woff2Files: fontFiles.length,
  javascriptGzipBytes: gzipTotal('.js'),
  cssGzipBytes: gzipTotal('.css'),
  maxGrowthRatio: budget.maxGrowthRatio,
}

console.log(`移动首屏构建预算：${JSON.stringify(summary)}`)

if (initialCssGzipBytes > MAX_INITIAL_CSS_GZIP_BYTES) {
  throw new Error(`首页初始 CSS 为 ${initialCssGzipBytes} B gzip，超过 ${MAX_INITIAL_CSS_GZIP_BYTES} B 门禁。`)
}
if (fontFiles.length > 0) throw new Error(`构建产物包含 ${fontFiles.length} 个 WOFF2，系统中文字体方案发生回归。`)
for (const key of ['javascriptGzipBytes', 'cssGzipBytes']) {
  if (summary[key] > budget[key] * budget.maxGrowthRatio) {
    throw new Error(`${key}: ${summary[key]} B exceeds baseline ${budget[key]} B + 5%. Explain and review any budget change.`)
  }
}
