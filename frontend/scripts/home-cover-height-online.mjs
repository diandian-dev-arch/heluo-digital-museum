import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const out = '../artifacts/home-cover-height-online-20260911'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const results = []
try {
  for (const [width, height] of [[1440,900],[2050,986],[1920,1200],[412,915]]) for (const theme of ['light','dark']) for (const locale of ['zh-CN','en-US']) {
    const page = await browser.newPage({ viewport:{width,height}, reducedMotion:'reduce' })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(({theme,locale}) => {localStorage.setItem('heluo.theme',theme);localStorage.setItem('heluo.locale',locale)}, {theme,locale})
    await page.goto('https://heluo.pocketbay.app/', {waitUntil:'networkidle'})
    const app = page.frames().find(f=>f.url().startsWith('https://heluo--e.pocketbay.app/')) ?? page
    await app.locator('.corridor-home__hero-media').evaluate(img => img.decode())
    const result = await app.evaluate(() => {
      const cover = document.querySelector('.home-cover'), r = cover.getBoundingClientRect()
      return {viewportHeight:innerHeight,height:r.height, minHeight:getComputedStyle(cover).minHeight, overflow:document.documentElement.scrollWidth>innerWidth, actionsInside:[...document.querySelectorAll('.home-cover__actions a')].every(a=>a.getBoundingClientRect().bottom<=r.bottom), mobilePadding:getComputedStyle(document.querySelector('.home-cover__actions')).paddingTop}
    })
    assert.equal(result.overflow,false)
    assert(result.actionsInside)
    assert.deepEqual(errors,[])
    if(width>760) assert(Math.abs(result.height-Math.min(1040,Math.max(800,result.viewportHeight*.9)))<1)
    else assert.equal(result.mobilePadding,'208px')
    await page.screenshot({path:`${out}/${width}-${height}-${theme}-${locale}.png`,fullPage:false})
    results.push({width,height,theme,locale,...result})
    await page.close()
  }
  await writeFile(`${out}/summary.json`,JSON.stringify(results,null,2))
  console.log(JSON.stringify({passed:true,states:results.length,results}))
}finally{await browser.close()}
