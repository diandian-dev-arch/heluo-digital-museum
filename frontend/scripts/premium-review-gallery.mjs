import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const baseURL = 'http://127.0.0.1:4209'
const output = resolve('../artifacts/premium-visual-2026-09-10/review-gallery-4209')
const signature = async () => {
  const response = await fetch(baseURL)
  assert.equal(response.status, 200)
  return createHash('sha256').update(await response.text()).digest('hex')
}
const startSignature = await signature()
assert.equal(startSignature, '2ca809f10772587e7b051efc80062c4d100bdd1eb65b317a06a64c86dbcfff08', 'Unexpected candidate')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) })
const results = []
try {
  for (const [name, path, title] of [['home', '/', '首页'], ['explore', '/explore', '探索'], ['appointment', '/appointment', '预约']]) {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      await context.addInitScript(theme => {
        localStorage.setItem('heluo.theme', theme)
        localStorage.setItem('heluo.locale', 'zh-CN')
      }, theme)
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort())
      await page.goto(baseURL + path, { waitUntil: 'networkidle' })
      await page.locator('h1').first().waitFor()
      await page.evaluate(async () => {
        await document.fonts.ready
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise(resolve => setTimeout(resolve, 60))
        }
        await Promise.all([...document.images].map(img => img.decode().catch(() => {})))
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(350)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert.ok(overflow <= 1, `${name} ${width} ${theme} overflow`)
      assert.deepEqual(errors, [])
      const file = `${name}-${width}-${theme}.png`
      await page.screenshot({ path: resolve(output, file), fullPage: true })
      results.push({ name, title, path, width, theme, file, overflow, errors })
      await context.close()
    }
  }
} finally { await browser.close() }
assert.equal(await signature(), startSignature, 'Candidate changed during capture')
assert.equal(results.length, 12)
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ complete: true, baseURL, buildSignature: startSignature, results }, null, 2))
const sections = results.map(row => `<article><h2>${row.title} · ${row.width === 390 ? '手机布局' : '桌面布局'} · ${row.theme === 'light' ? '浅色' : '深色'}</h2><a href="${row.file}"><img loading="lazy" src="${row.file}" alt="${row.title} ${row.width}px ${row.theme === 'light' ? '浅色' : '深色'}完整页面"></a><p><a href="${row.file}">打开原尺寸图片</a></p></article>`).join('')
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>河洛视觉样板 · 十二图评审</title><style>body{margin:0;background:#f5f7f5;color:#203d35;font:16px/1.7 "Microsoft YaHei",sans-serif}main{max-width:1200px;margin:auto;padding:32px 20px}h1{font:normal 36px/1.4 SimSun,serif}header{margin-bottom:32px}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}article{min-width:0}h2{font-size:18px}img{display:block;width:100%;height:auto;border:1px solid #bbc9c1}a{color:#205741}code{overflow-wrap:anywhere}small{display:block} @media(max-width:760px){section{grid-template-columns:1fr}}</style><main><header><h1>河洛纸墨 · 十二图评审</h1><p>首页、探索与预约页，同一候选的桌面/手机布局、浅色/深色对照。点击图片查看原尺寸。</p><p>评审重点：器物完整、图片与标题对齐、文字层次、主要操作可发现。手机图来自浏览器尺寸模拟，真机调试按用户要求延期。全页截图中的固定导航位置不单独作为遮挡证据。</p><small>候选：${baseURL} · SHA256：<code>${startSignature}</code></small></header><section>${sections}</section></main></html>`)
console.log(JSON.stringify({ complete: true, states: results.length, buildSignature: startSignature, output }))
