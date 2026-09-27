import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const base=process.env.HELUO_BASE_URL || 'https://heluo.pocketbay.app'
const out=`../artifacts/home-entry-${Date.now()}`
await mkdir(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try {
  for(const [path,expired] of [['/',false],['/',true],['/profile',true],['/login',false]]) {
    const page=await browser.newPage({viewport:{width:390,height:844}})
    await page.addInitScript(expired=>{
      if(expired) localStorage.setItem('heluo.access-token','expired-home-entry-test')
      else localStorage.removeItem('heluo.access-token')
    },expired)
    const authResponses=[]
    page.on('response',r=>{if(new URL(r.url()).pathname==='/api/v1/auth/me') authResponses.push(r.status())})
    await page.goto(base+path,{waitUntil:'domcontentloaded'})
    const wake=page.getByRole('button',{name:'唤醒并继续',exact:true})
    if(await wake.isVisible()) await wake.click({noWaitAfter:true})
    const app=base.includes('pocketbay.app')?page.frameLocator('iframe'):page
    await app.locator('h1').first().waitFor({timeout:60000})
    if(expired) { for(let i=0;i<50&&!authResponses.length;i++) await page.waitForTimeout(100) }
    await page.waitForTimeout(1000)
    const state=await app.locator('html').evaluate(()=>({path:location.pathname,query:location.search,home:!!document.querySelector('.corridor-home'),tokenCleared:!localStorage.getItem('heluo.access-token')}))
    results.push({requested:path,expired,authResponses,...state})
    await page.close()
  }
  console.log(JSON.stringify({out,results},null,2))
  if(process.argv.includes('--verify')) {
    assert.equal(results[0].home,true);assert.equal(results[1].home,true)
    assert.equal(results[1].path,'/');assert.equal(results[1].tokenCleared,true)
    assert(results[1].authResponses.includes(401));assert.equal(results[2].path,'/login')
    assert.equal(results[3].path,'/login')
  }
} finally {
  await browser.close();await writeFile(`${out}/summary.json`,JSON.stringify({base,results},null,2))
}
