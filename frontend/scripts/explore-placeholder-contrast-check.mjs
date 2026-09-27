import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const base='http://127.0.0.1:4189'
const phase=process.env.PLACEHOLDER_PHASE ?? 'before'
const out=resolve(`../artifacts/premium-visual-2026-09-12/explore-placeholder/${phase}`)
await mkdir(out,{recursive:true})
const signature=async()=>createHash('sha256').update(await(await fetch(base)).text()).digest('hex')
const start=await signature(), results=[], writes=[]
const lum=rgb=>rgb.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0)
const browser=await chromium.launch({headless:true})
try {
for(const width of [390,1440]) for(const theme of ['light','dark']) for(const locale of ['zh-CN','en-US']) {
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'})
 await context.addInitScript(({theme,locale})=>{localStorage.setItem('heluo.theme',theme);localStorage.setItem('heluo.locale',locale)},{theme,locale})
 await context.route('**/api/**',async r=>{if(!['GET','HEAD','OPTIONS'].includes(r.request().method())){writes.push(r.request().method());return r.abort()}return r.continue()})
 const page=await context.newPage();await page.goto(base+'/explore',{waitUntil:'domcontentloaded'});await page.locator('.gallery-search input').waitFor();await page.evaluate(()=>document.fonts.ready)
 for(const state of ['default','hover','focus']) {
  const input=page.locator('.gallery-search input'), control=page.locator('.gallery-search .museum-search-field__control')
  if(state==='hover')await control.hover();if(state==='focus'){await input.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab')}
  await page.waitForTimeout(200)
  const values=await input.evaluate(el=>{const s=getComputedStyle(el,'::placeholder'),p=getComputedStyle(el.parentElement),b=getComputedStyle(el.parentElement.querySelector('.museum-search-field__submit'));return {color:s.color,opacity:s.opacity,fontSize:getComputedStyle(el).fontSize,control:{bg:p.backgroundColor,border:p.borderColor,height:p.height,width:p.width,outline:p.outline,offset:p.outlineOffset},button:{bg:b.backgroundColor,color:b.color,width:b.width,height:b.height}}})
  const box=await input.boundingBox(),png=await page.screenshot({path:resolve(out,`${width}-${theme}-${locale}-${state}.png`)})
  const background=await page.evaluate(async({url,x,y})=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(x,y,1,1).data].slice(0,3)},{url:'data:image/png;base64,'+png.toString('base64'),x:Math.ceil(box.x+5),y:Math.ceil(box.y+2)})
  const rgb=values.color.match(/[\d.]+/g).slice(0,3).map(Number), a=lum(rgb),b=lum(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05)
  results.push({width,theme,locale,state,...values,background,ratio,passed:ratio>=4.5})
 }
 await context.close()
}
} finally {await browser.close(); const end=await signature();await writeFile(resolve(out,'summary.json'),JSON.stringify({start,end,stable:start===end,results,writes,passed:results.length===24&&results.every(r=>r.passed)&&start===end},null,2));console.log(JSON.stringify({phase,start,end,count:results.length,minimum:Math.min(...results.map(r=>r.ratio)),failures:results.filter(r=>!r.passed).length,out}))}
if(phase==='after') {assert.equal(results.length,24);assert(results.every(r=>r.passed),'Placeholder contrast must reach 4.5:1 in all sampled states');assert.equal(writes.length,0);assert.equal(start,await signature(),'Candidate must stay frozen')}
