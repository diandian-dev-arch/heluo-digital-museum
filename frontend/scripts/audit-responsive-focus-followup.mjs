import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const base = 'http://127.0.0.1:4189'
const output = resolve('../artifacts/premium-visual-2026-09-12/responsive-focus-followup')
await mkdir(output, { recursive: true })
const signature = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const startSignature = await signature()
if (startSignature !== (process.env.HELUO_EXPECTED_SIGNATURE ?? 'a7f7eb189bc07d954e41ba24a53404989cb2dbfe9e1c599b5bb188d78ef2ad0b')) throw Error('Unexpected candidate')
const browser = await chromium.launch({ headless: true })
const results = [], blockedWrites = [], errors = []
const hit = el => {
  const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return { text: el.textContent.trim(), top: r.top, bottom: r.bottom, width: r.width, height: r.height, hit: !!top && (top === el || el.contains(top)), hitElement:top?.outerHTML.slice(0,300), focused: document.activeElement === el }
}
try {
  for (const [width, height] of [[760,844],[761,844],[900,844],[901,844],[1024,768],[1280,800],[390,844]]) {
    for (const theme of ['light','dark']) {
      const locale = width === 390 || width === 761 || width === 901 || width === 1280 ? 'en-US' : 'zh-CN'
      const context = await browser.newContext({ viewport: {width,height}, reducedMotion: 'reduce' })
      await context.addInitScript(({theme,locale}) => { localStorage.setItem('heluo.theme',theme); localStorage.setItem('heluo.locale',locale) }, {theme,locale})
      await context.route('**/api/**', async route => {
        if (!['GET','HEAD','OPTIONS'].includes(route.request().method())) { blockedWrites.push(route.request().method() + ' ' + new URL(route.request().url()).pathname); return route.abort() }
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', e => errors.push(String(e)))
      let detail
      for (const path of ['/', '/explore', '/appointment', '/shop', ...(width === 390 ? ['DETAIL'] : [])]) {
        if (path === 'DETAIL' && !detail) continue
        const route = path === 'DETAIL' ? detail : path
        const response = await page.goto(base + route, {waitUntil:'domcontentloaded'})
        await page.locator('#main-content').waitFor()
        await page.waitForTimeout(650)
        if (path === '/explore') detail = await page.locator('a[href^="/artifacts/"]').first().getAttribute('href')
        const row = {width,height,theme,locale,route,status:response.status()}
        row.default = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth, main:!!document.querySelector('#main-content')}))
        if (width === 390 && path === '/explore') {
          const button = page.locator('.collection-filters button').nth(3)
          row.categoryBefore = await button.evaluate(hit)
          await page.locator('.collection-filters button').nth(2).focus()
          await page.keyboard.press('Tab')
          row.categoryAfterTab = await button.evaluate(hit)
          row.categoryScrollLeft = await page.locator('.collection-filters').evaluate(el=>el.scrollLeft)
          await page.screenshot({path:resolve(output,`category-${theme}.png`)})
          await page.emulateMedia({forcedColors:'active'})
          const input = page.locator('.museum-search-field input').first()
          await input.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
          row.forcedColors = await input.evaluate(el => { const styles = node => {const s=getComputedStyle(node);return {className:node.className,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineOffset:s.outlineOffset,outlineColor:s.outlineColor,borderColor:s.borderColor}}; return {active:matchMedia('(forced-colors: active)').matches,focusVisible:el.matches(':focus-visible'),input:styles(el),ancestors:[styles(el.parentElement),styles(el.parentElement.parentElement)]} })
          await page.screenshot({path:resolve(output,`forced-colors-${theme}.png`)})
          await page.emulateMedia({forcedColors:'none'})
        }
        await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,document.documentElement.scrollHeight)})
        await page.waitForTimeout(150)
        row.bottom = await page.evaluate(()=>{const n=document.querySelector('.mobile-tab-bar'),nr=n?.getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();const controls=[...document.querySelectorAll('main a, main button, main input')].filter(el=>getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length&&getComputedStyle(el).position!=='fixed');const last=controls.at(-1)?.getBoundingClientRect();return {atBottom:Math.abs(scrollY+innerHeight-document.documentElement.scrollHeight)<2,navVisible:!!nr?.height,navTop:nr?.top,mainBottom:m.bottom,lastControlBottom:last?.bottom,lastControlClearsNav:!nr?.height||!last||last.bottom<=nr.top+1}})
        row.nav = []
        const links = page.locator('.mobile-tab-bar a')
        if (row.bottom.navVisible) for(let i=0;i<await links.count();i++) {
          if(i===0) await links.nth(i).focus(); else await page.keyboard.press('Tab')
          row.nav.push(await links.nth(i).evaluate(hit))
        }
        await page.screenshot({path:resolve(output,`${width}-${theme}-${path.replaceAll('/','')||'home'}.png`)})
        results.push(row)
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
  const endSignature = await signature()
  const failures = results.filter(r=>r.status!==200||r.default.overflow||!r.bottom.lastControlClearsNav||r.nav.some(n=>!n.hit||!n.focused)||r.categoryAfterTab&&(!r.categoryAfterTab.focused||!r.categoryAfterTab.hit))
  await writeFile(resolve(output,'summary.json'),JSON.stringify({startSignature,endSignature,complete:results.length===58,results,failures,blockedWrites,errors,limitations:['Forced colors is Chromium emulation, not Windows system validation','No native zoom, physical device, authentication or business writes','Final scroll position tested; ordinary mid-scroll fixed overlay is not a failure','Center hit test does not prove every label pixel unobscured']},null,2))
  console.log(JSON.stringify({count:results.length,failures:failures.length,errors:errors.length,blockedWrites:blockedWrites.length,signatureStable:startSignature===endSignature,output}))
}
