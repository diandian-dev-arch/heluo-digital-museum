import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
const outer='https://heluo.pocketbay.app', inner='https://heluo--e.pocketbay.app'
const output=`../artifacts/pocketbay-visual-final-online-${Date.now()}`
await mkdir(output,{recursive:true})
const sha=b=>createHash('sha256').update(b).digest('hex')
const results=[],http=[],errors=[],blocked=[],failedRequests=[]
const browser=await chromium.launch({channel:'chrome',headless:true})
let passed=false
try {
  const wakePage=await browser.newPage()
  await wakePage.goto(outer,{waitUntil:'domcontentloaded'})
  const wake=wakePage.getByRole('button',{name:'唤醒并继续',exact:true})
  if(await wake.isVisible()) await wake.click({noWaitAfter:true})
  await wakePage.frameLocator('iframe').locator('.corridor-home').waitFor({timeout:90000})
  await wakePage.close()
  for(const path of ['/','/api/v1/health','/api/v1/ready']) {
    const r=await fetch(inner+path,{signal:AbortSignal.timeout(30000)}),body=Buffer.from(await r.arrayBuffer())
    assert.equal(r.status,200,path)
    if(path==='/') {
      const injection='<style id="pb-embed-hide-chrome">#pb-host-splash,#pb-host-banner,#pb-host-badge,#pb-host-mark,#pb-host-widget,#pb-host-mask{display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important}</style>'
      const html=body.toString('utf8')
      assert.equal(html.split(injection).length,2,'Expected exactly one observed PocketBay embedding style')
      assert.equal(sha(html.replace(injection,'')),sha(await readFile('dist/index.html')),'HTML differs beyond the exact observed platform style')
    }
    else assert.equal(JSON.parse(body).data.status,'UP',path)
    http.push({path,status:r.status,sha256:sha(body)})
  }
  const files=(await readdir('dist/assets')).filter(f=>/\.(js|css)$/.test(f))
  for(let i=0;i<files.length;i+=6) await Promise.all(files.slice(i,i+6).map(async file=>{
    const r=await fetch(inner+'/assets/'+file,{signal:AbortSignal.timeout(30000)})
    assert.equal(r.status,200,file)
    const hash=sha(Buffer.from(await r.arrayBuffer()))
    assert.equal(hash,sha(await readFile('dist/assets/'+file)),file)
    http.push({path:'/assets/'+file,status:200,sha256:hash})
  }))
  for(const width of process.env.HELUO_ONLINE_PROBE ? [390] : [390,1440]) for(const theme of process.env.HELUO_ONLINE_PROBE ? ['light'] : ['light','dark']) {
    const page=await browser.newPage({viewport:{width,height:915},reducedMotion:'reduce'})
    page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}))
    page.on('requestfailed',r=>failedRequests.push({url:r.url(),method:r.method(),failure:r.failure()}))
    await page.addInitScript(({theme})=>{
      localStorage.setItem('heluo.theme',theme);localStorage.setItem('heluo.locale','zh-CN')
    },{theme})
    await page.route('**/api/**',route=>{
      if(['GET','HEAD','OPTIONS'].includes(route.request().method())) return route.continue()
      if(route.request().url()==='https://pocketbay.com/api/analytics/collect') return route.continue()
      blocked.push({url:route.request().url(),method:route.request().method()});return route.abort()
    })
    await page.goto(outer,{waitUntil:'domcontentloaded'})
    const app=page.frameLocator('iframe')
    await app.locator('.corridor-home').waitFor({timeout:60000})
    for(const [path,selector] of [['/','.corridor-home'],['/explore','.gallery-object'],['/appointment','.appointment-dates'],['/shop','.shop-content']]) {
      if(path!=='/') {
        const link=app.locator(`a[href="${path}"]:visible`).first()
        await link.click()
      }
      await app.locator(selector).first().waitFor({timeout:30000})
      await app.locator('html').evaluate(async()=>{
        await document.fonts.ready
        await Promise.all([...document.querySelectorAll('main img')].filter(i=>i.getBoundingClientRect().top<innerHeight).map(i=>i.decode().catch(()=>{})))
      })
      const state=await app.locator('html').evaluate(()=>({path:location.pathname,theme:document.documentElement.dataset.theme,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,heading:document.querySelector('h1')?.textContent,visibleImages:[...document.querySelectorAll('main img')].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0}))}))
      assert.equal(state.path,path);assert.equal(state.theme,theme);assert.equal(state.overflow,false,`${path} ${width}`)
      assert(state.visibleImages.every(i=>i.loaded))
      if(path==='/explore') {
        const input=app.locator('.gallery-search input');await input.fill('青铜');await input.press('Enter')
        await app.locator('#collection-search-results').waitFor()
        await app.locator('#collection-search-results .gallery-text-link').first().click()
        await app.locator('.gallery-filters').waitFor()
        await app.locator('.gallery-object').first().waitFor()
        await app.locator('.gallery-object img').first().evaluate(i=>i.decode())
        state.searchAndClear=true
      }
      await page.screenshot({path:`${output}/${width}-${theme}-${path==='/'?'home':path.slice(1)}.png`})
      results.push(state);console.log(`PASS ${width} ${theme} ${path}`)
    }
    await page.close()
  }
  assert.deepEqual(errors,[]);passed=true
} finally {
  await browser.close()
  await writeFile(`${output}/summary.json`,JSON.stringify({passed,output,results,http,errors,blocked,failedRequests,scope:'Live outer-iframe route states through visible navigation; Chinese, selected themes and viewports; read-only API; all JS/CSS asset hashes. No production business writes or mobile GPU proof.'},null,2))
  console.log(JSON.stringify({passed,states:results.length,httpChecks:http.length,errors,output}))
}
