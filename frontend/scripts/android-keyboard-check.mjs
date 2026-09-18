import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
const serial = '10AE641DSN000HE', base = 'http://127.0.0.1:4189'
const themes = process.env.HELUO_KEYBOARD_THEMES?.split(',') || ['light', 'dark']
const routes = process.env.HELUO_KEYBOARD_ROUTES?.split(',') || ['/login', '/appointment']
const output = resolve('../artifacts/real-device', `keyboard-${Date.now()}`)
await mkdir(output, { recursive: true })
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { maxBuffer: 24 * 1024 * 1024 })
const signature = async () => createHash('sha256').update(await (await fetch(base)).text()).digest('hex')
const result = { start: await signature(), device: adb('shell', 'getprop', 'ro.product.model').toString().trim(), groups: [] }
const browser = await chromium.connectOverCDP('http://127.0.0.1:19222')
const page = await browser.contexts()[0].newPage(), cdp = await page.context().newCDPSession(page)
const viewport = () => page.evaluate(() => ({ innerWidth, innerHeight, width: visualViewport.width, height: visualViewport.height, offsetTop: visualViewport.offsetTop, scale: visualViewport.scale, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }))
async function capture(name) {
  await writeFile(resolve(output, `${name}.png`), adb('exec-out', 'screencap', '-p'))
  const ime = adb('shell', 'dumpsys', 'input_method').toString().split('\n').filter(line => /mInputShown|mIsInputViewShown|mShowRequested|mImeWindowVis/.test(line)).map(x => x.trim())
  return { viewport: await viewport(), ime, screenshot: `${name}.png` }
}
async function geometry(locator) {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect(), v = visualViewport, x = r.x + r.width / 2, y = r.y + r.height / 2
    const hit = document.elementFromPoint(x, y)
    return { rect: r.toJSON(), inVisualViewport: x >= v.offsetLeft && x <= v.offsetLeft + v.width && y >= v.offsetTop && y <= v.offsetTop + v.height, centerHit: hit === el || el.contains(hit), active: document.activeElement === el, hit: hit?.tagName }
  })
}
async function touch(locator) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(900)
}
try {
  await page.bringToFront()
  for (const theme of themes) for (const route of routes) {
    await page.goto(base + route, { waitUntil: 'domcontentloaded' })
    await page.evaluate(theme => localStorage.setItem('heluo.theme', theme), theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('main').waitFor()
    if (route === '/appointment') {
      await page.locator('.appointment-day:not(:disabled)').first().click()
      await page.locator('.appointment-time:not(:disabled)').first().click()
      await page.locator('.appointment-mobile-action button').click()
    }
    const prefix = `${theme}-${route.slice(1)}`
    const baseline = await viewport(), fields = route === '/login' ? ['input[autocomplete="username"]', 'input[autocomplete="current-password"]'] : ['input[autocomplete="name"]', 'input[autocomplete="tel"]', 'input[autocomplete="email"]', 'textarea']
    const group = { theme, route, baseline, fields: [] }; result.groups.push(group)
    for (const [index, selector] of fields.entries()) {
      const field = page.locator(selector).filter({ visible: true }).first()
      await touch(field)
      const evidence = await capture(`${prefix}-field-${index}`)
      group.fields.push({ selector, ...evidence, geometry: await geometry(field), keyboardResized: evidence.viewport.height < baseline.height - 100 })
    }
    const submit = page.locator('form button[type="submit"]').filter({ visible: true }).last()
    await submit.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.waitForTimeout(450)
    group.actionWithKeyboard = { ...await capture(`${prefix}-action-keyboard`), geometry: await geometry(submit) }
    adb('shell', 'input', 'keyevent', '4')
    await page.waitForTimeout(500)
    await submit.scrollIntoViewIfNeeded()
    group.actionAfterKeyboard = { ...await capture(`${prefix}-action-closed`), geometry: await geometry(submit) }
    group.geometryPassed = [...group.fields.map(x => x.geometry), group.actionWithKeyboard.geometry, group.actionAfterKeyboard.geometry].every(x => x.inVisualViewport && x.centerHit)
    group.imeConfirmedForEveryField = group.fields.every(x => x.keyboardResized && x.ime.includes('mInputShown=true'))
  }
} catch (error) { result.error = String(error); process.exitCode = 1 }
finally {
  result.end = await signature()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(result, null, 2))
  await page.close(); await browser.close()
  console.log(JSON.stringify({ output, error: result.error, groups: result.groups.length }))
}
