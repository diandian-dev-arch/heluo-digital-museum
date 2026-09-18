import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ forcedColors: 'active', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:4189/explore')
  const button = page.locator('.gallery-filters button.active')
  console.log(JSON.stringify(await button.evaluate(el => ({ html: el.outerHTML, styles: [null, '::before', '::after'].map(p => { const s = getComputedStyle(el,p); return { pseudo:p,color:s.color,background:s.backgroundColor,textFill:s.webkitTextFillColor,adjust:s.forcedColorAdjust,content:s.content } }) }))))
  await page.screenshot({ path: '../artifacts/premium-visual-2026-09-12/forced-category-before.png' })
  await page.addStyleTag({content:'@media(forced-colors:active){html #app #explore-gallery .gallery-filters button.active{forced-color-adjust:none!important;color:HighlightText!important;background:Highlight!important;}}'})
  await page.screenshot({ path: '../artifacts/premium-visual-2026-09-12/forced-category-trial.png' })
} finally { await browser.close() }
