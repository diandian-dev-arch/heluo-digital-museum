import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('../artifacts/real-device', `candidate-${Date.now()}`)
await mkdir(output, {recursive:true})
const browser = await chromium.connectOverCDP('http://127.0.0.1:19222')
const page = browser.contexts()[0].pages().find(p=>p.url().startsWith('https://heluo.pocketbay.app/') || p.url().startsWith('http://127.0.0.1:4189/'))
const results=[]
try {
  if (!page) throw new Error('No museum tab available')
  for (const route of ['/', '/explore', '/appointment', '/shop', '/exhibits/heluo-bronze-ding-3d']) {
    await page.goto(`http://127.0.0.1:4189${route}`, {waitUntil:'domcontentloaded'})
    await page.locator('main').waitFor()
    await page.waitForTimeout(2500)
    const name=route.replaceAll('/','_') || 'home'
    await page.screenshot({path:resolve(output,`${name}.png`)})
    const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,brokenImages:[...document.images].filter(x=>x.complete&&!x.naturalWidth).map(x=>x.currentSrc),text:document.querySelector('main')?.innerText.slice(0,180)}))
    await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto'; scrollTo(0,document.documentElement.scrollHeight)})
    await page.waitForTimeout(300)
    const bottom=await page.evaluate(()=>{const nav=document.querySelector('.mobile-tab-bar')?.getBoundingClientRect(); const controls=[...document.querySelectorAll('main a, main button')].filter(x=>x.getBoundingClientRect().height>0);const last=controls.at(-1); return {navTop:nav?.top,lastControl:last?.textContent?.trim(),lastControlBottom:last?.getBoundingClientRect().bottom,atBottom:Math.abs(scrollY+innerHeight-document.documentElement.scrollHeight)<2}})
    await page.screenshot({path:resolve(output,`${name}-bottom.png`)})
    results.push({route,...metrics,bottom})
  }
} finally { await writeFile(resolve(output,'results.json'),JSON.stringify({scope:'Actual Android viewport, current theme and locale; 3D poster only, no business submissions',results},null,2)); await browser.close(); console.log(JSON.stringify({output,results},null,2)) }
