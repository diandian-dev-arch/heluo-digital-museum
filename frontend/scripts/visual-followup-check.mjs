import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const output = new URL('../../artifacts/visual-followup-20260912/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const motion of ['no-preference', 'reduce']) {
    for (const locale of ['zh-CN', 'en-US']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: motion })
      await page.addInitScript(locale => { localStorage.setItem('heluo.theme', 'dark'); localStorage.setItem('heluo.locale', locale) }, locale)
      await page.goto('http://127.0.0.1:4189/', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      const lines = await page.locator('[data-motion="intro-title-line"]').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(), parent = node.parentElement.getBoundingClientRect()
        return { text: node.textContent, transform: getComputedStyle(node).transform, top: box.top, bottom: box.bottom, parentTop: parent.top, parentBottom: parent.bottom, contained: box.top >= parent.top - 1 && box.bottom <= parent.bottom + 1 }
      }))
      await page.screenshot({ path: new URL(`home-${motion}-${locale}.png`, output).pathname.replace(/^\/(.:)/, '$1') })
      results.push({ route: '/', motion, locale, lines })
      await page.close()
    }
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  for (const route of ['/explore', '/appointment', '/shop']) {
    await page.goto(`http://127.0.0.1:4189${route}`, { waitUntil: 'networkidle' })
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight) })
    results.push(await page.evaluate(route => {
      const nav = document.querySelector('.mobile-tab-bar').getBoundingClientRect()
      const main = document.querySelector('main').getBoundingClientRect()
      return { route, atBottom: Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight) < 2, mainBottom: main.bottom, navTop: nav.top, mainClearsNav: main.bottom <= nav.top }
    }, route))
    await page.screenshot({ path: new URL(`${route.slice(1)}-bottom.png`, output).pathname.replace(/^\/(.:)/, '$1') })
  }
  await page.goto('http://127.0.0.1:4189/exhibits', { waitUntil: 'networkidle' })
  const links = await page.locator('a[href^="/exhibits/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))
  results.push({ route: '/exhibits', links })
  await page.close()
} finally { await browser.close() }
await writeFile(new URL('results.json', output), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
