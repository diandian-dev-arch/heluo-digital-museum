import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const baseURL = process.env.HELUO_BASE_URL || 'http://127.0.0.1:4206'
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const output = resolve('../artifacts/holistic', `home-alignment-${Date.now()}`)
await mkdir(output, { recursive: true })
const report = { baseURL, complete: false, results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
 for(const width of [390,768,1440,1920]) for(const theme of ['light','dark']) for(const locale of ['zh-CN','en-US']) {
  const context = await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'})
  await context.addInitScript(({theme,locale})=>{localStorage.setItem('heluo.theme',theme);localStorage.setItem('heluo.locale',locale)}, {theme,locale})
  const page = await context.newPage()
  await page.goto(baseURL,{waitUntil:'domcontentloaded'})
  await page.locator('.home-themes').scrollIntoViewIfNeeded()
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.home-theme img')].map(i=>i.decode()))})
  const cards=await page.locator('.home-theme').evaluateAll(elements=>elements.map(el=>{const m=el.querySelector('.home-theme__media').getBoundingClientRect(),h=el.querySelector('h3').getBoundingClientRect(),i=el.querySelector('img');return {height:m.height,width:m.width,top:m.top,titleTop:h.top,fit:getComputedStyle(i).objectFit,loaded:i.naturalWidth>0,href:el.getAttribute('href')}}))
  assert.equal(cards.length,3)
  for(const c of cards){assert.equal(c.fit,'contain');assert.ok(c.loaded)}
  if(width>760){assert.ok(Math.max(...cards.map(c=>c.height))-Math.min(...cards.map(c=>c.height))<=1);assert.ok(Math.max(...cards.map(c=>c.titleTop))-Math.min(...cards.map(c=>c.titleTop))<=1)}
  else for(const c of cards)assert.ok(Math.abs(c.height-c.width)<=1)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.locator('.home-themes').screenshot({path:resolve(output,`${width}-${theme}-${locale}.png`)})
  for(let index=0;index<3;index++){
   await page.locator('.home-theme').nth(index).click()
   await expect(page).toHaveURL(new RegExp(`category=${['BRONZE','JADE','RIVER'][index]}`))
   await page.goBack();await expect(page.locator('.home-themes')).toBeVisible()
  }
  report.results.push({width,theme,locale,cards,passed:true})
  await context.close()
 }
 report.complete=true
}finally{await browser.close();await writeFile(resolve(output,'summary.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify({output,complete:report.complete,groups:report.results.length}))
