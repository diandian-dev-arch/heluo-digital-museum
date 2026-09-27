import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const start = Date.now()
const output = resolve('../artifacts/real-device', `quick-${new Date().toISOString().replace(/[:.]/g, '-')}`)
await mkdir(output, { recursive: true })
const report = { startedAt: new Date().toISOString(), scope: '真实 Android Chrome 公开页面基础检查；非业务提交、非完整3D交互或性能基准', results: [] }
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 10000 }).trim()
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
let browser
try {
  const devices = adb('devices').split('\n').slice(1).filter(x => /\tdevice\s*$/.test(x))
  if (devices.length !== 1) throw new Error('请只连接一台已授权 Android 手机')
  report.device = { model: adb('shell','getprop','ro.product.model'), android: adb('shell','getprop','ro.build.version.release') }
  adb('forward','tcp:19222','localabstract:chrome_devtools_remote')
  browser = await chromium.connectOverCDP('http://127.0.0.1:19222', { timeout: 15000 })
  report.browser = browser.version()
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('https://heluo.pocketbay.app/'))
  if (!page) throw new Error('请在手机 Chrome 打开 https://heluo.pocketbay.app/')
  page.setDefaultTimeout(12000)
  const frame = page.frames().find(f => f.url().startsWith('https://heluo--e.pocketbay.app/'))
  if (!frame) throw new Error('未找到实际应用 iframe，可能仍在平台启动阶段')
  report.outerURL = page.url()
  report.userAgent = await frame.evaluate(() => navigator.userAgent)
  const cases = [['首页','/'],['馆藏','/explore'],['展厅','/exhibits'],['预约','/appointment'],['文创','/shop'],['3D展项',null]]
  for (let i=0;i<cases.length;i++) {
    const [name,initialPath] = cases[i]
    const result = { name, status:'未完成', errors: [] }
    report.results.push(result)
    const onError = e => result.errors.push(e.message)
    page.on('pageerror',onError)
    try {
      let path = initialPath
      if (!path) {
        await frame.locator('a[href="/exhibits"]:visible').first().click()
        await frame.waitForURL('**/exhibits')
        const link = frame.locator('a[href^="/exhibits/"]:visible').first()
        await link.waitFor({state:'visible'})
        path = await link.getAttribute('href')
      }
      const t = Date.now()
      if (new URL(frame.url()).pathname !== path) {
        await frame.locator(`a[href="${path}"]:visible`).first().click()
        await frame.waitForURL(url => url.pathname === path)
      }
      await frame.locator('main').waitFor({state:'visible'})
      if (name === '3D展项') await frame.locator('[data-render-state="running"]').waitFor({state:'attached',timeout:60000})
      result.navigationObservationMs = Date.now()-t
      result.timingNote = name==='首页' ? '已打开页面，非首次加载计时' : '单次导航到 main 可见；3D另等待running；不等同完整可操作耗时'
      await page.waitForTimeout(1500)
      result.layout = await frame.evaluate(() => ({url:location.href,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,mainTextLength:document.querySelector('main')?.textContent?.trim().length??0,brokenImages:[...document.images].filter(x=>x.complete&&!x.naturalWidth).map(x=>x.currentSrc),renderState:document.querySelector('[data-render-state]')?.getAttribute('data-render-state')}))
      result.outerOverflow = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
      result.screenshot = `${i+1}.png`
      await page.screenshot({path:resolve(output,result.screenshot),timeout:15000})
      result.status = result.layout.overflow<=1 && result.outerOverflow<=1 && result.layout.mainTextLength>0 && !result.layout.brokenImages.length && !result.errors.length && (name!=='3D展项'||result.layout.renderState==='running') ? '基础检查通过':'需复核'
    } catch(e) { result.status='失败或阻塞'; result.error=e.message }
    finally { page.off('pageerror',onError); console.log(`${name}: ${result.status}`) }
  }
} catch(e) {report.blocker=e.message;process.exitCode=1}
finally {
  await browser?.close()
  report.durationSeconds = Math.round((Date.now()-start)/1000)
  report.finishedAt = new Date().toISOString()
  if (report.results.some(r=>r.status!=='基础检查通过')) process.exitCode=1
  await writeFile(resolve(output,'results.json'), JSON.stringify(report,null,2))
  await writeFile(resolve(output,'report.html'),`<!doctype html><meta charset="utf-8"><title>Android 真机基础报告</title><style>body{max-width:1000px;margin:32px auto;padding:0 20px;font:16px/1.6 system-ui}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:10px;text-align:left}img{max-width:360px;width:100%}small{color:#555}</style><h1>Android 真机基础报告</h1><p>${escape(report.device?.model)} · Android ${escape(report.device?.android)} · Chrome ${escape(report.browser)}</p><p>${escape(report.startedAt)} · 执行 ${report.durationSeconds} 秒</p><p>${escape(report.scope)}</p><p>本轮只做公开浏览，不创建预约或订单。网络类型、部署版本、3D旋转缩放、业务提交与长时间稳定性尚未验证。页面计时为单次观察，不是首屏性能指标。</p>${report.blocker?`<p>阻塞：${escape(report.blocker)}</p>`:''}<table><tr><th>页面</th><th>结果</th><th>观察耗时</th><th>异常</th></tr>${report.results.map(r=>`<tr><td>${escape(r.name)}</td><td>${escape(r.status)}</td><td>${r.navigationObservationMs??'—'} ms</td><td>${escape(r.error??r.errors.join('; '))}</td></tr>`).join('')}</table>${report.results.filter(r=>r.screenshot).map(r=>`<h2>${escape(r.name)}</h2><p>${escape(r.layout?.url)} · 页面溢出 ${r.layout?.overflow}px</p><a href="${r.screenshot}"><img src="${r.screenshot}"></a>`).join('')}<p><a href="results.json">完整原始数据</a></p>`)
  console.log(`REPORT: ${resolve(output,'report.html')}`)
}
