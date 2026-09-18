import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const environmentPath = process.env.HELUO_QUALITY_ENV_FILE
assert.ok(environmentPath, 'Provide the isolated candidate environment file.')
const env = JSON.parse(await readFile(environmentPath, 'utf8'))
env.baseURL = process.env.HELUO_BASE_URL ?? env.baseURL
assert.equal(new URL(env.baseURL).hostname, '127.0.0.1')
const output = resolve('../artifacts/holistic', `controls-${Date.now()}`)
await mkdir(output, { recursive: true })
const initialHtml = await (await fetch(env.baseURL)).text()
const signature = createHash('sha256').update(initialHtml).digest('hex')
const login = await fetch(`${env.baseURL}/api/v1/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin),
})
assert.equal(login.status, 200)
const token = (await login.json()).data.accessToken
const meResponse = await fetch(`${env.baseURL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
assert.equal(meResponse.status, 200)
const me = (await meResponse.json()).data
const report = { timestamp: new Date().toISOString(), baseURL: env.baseURL, buildSignature: signature, complete: false,
  scope: 'Real profile forms, order list/pagination and admin action controls. Responses are intercepted; no profile/order/admin writes reach the backend. Mouse press is cancelled before release.', results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const label = `${width}-${theme}-${locale}`
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', locale })
    await context.addInitScript(({ token, theme, locale }) => {
      localStorage.setItem('heluo.access-token', token); localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', locale)
    }, { token, theme, locale })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const checks = [], states = []
    let mutations = 0, releaseSave, saveState = 'pending', releaseOrders, ordersState = 'pending'
    let saveGate = new Promise(done => { releaseSave = done })
    const ordersGate = new Promise(done => { releaseOrders = done })
    const order = { id: 900001, orderNo: 'UI-AUDIT-ORDER', status: 'PAID', payableAmount: '39.00', notificationEmail: 'audit@example.test', expiresAt: '', items: [{ productId: 900001, name: '界面验收商品', quantity: 1, subtotalAmount: '39.00' }] }
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        mutations++
        if (url.pathname === '/api/v1/users/me' && request.method() === 'PATCH') {
          if (saveState === 'pending') await saveGate
          await route.fulfill({ status: saveState === 'success' ? 200 : 503, contentType: 'application/json', body: JSON.stringify(saveState === 'success'
            ? { data: { ...me, ...request.postDataJSON() } }
            : { message: locale === 'zh-CN' ? '验收模拟：资料暂时无法保存。' : 'Audit simulation: profile could not be saved.' }) })
        } else await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Audit blocked an unexpected write.' }) })
        return
      }
      if (url.pathname === '/api/v1/orders') {
        if (ordersState === 'pending') await ordersGate
        if (ordersState === 'error') {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: locale === 'zh-CN' ? '验收模拟：订单暂时无法加载。' : 'Audit simulation: orders could not be loaded.' }) }); return
        }
        const number = Number(url.searchParams.get('page') || 1)
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: ordersState === 'empty' ? [] : [{ ...order, id: order.id + number, orderNo: `${order.orderNo}-${number}` }], total: ordersState === 'empty' ? 0 : 21, totalPages: ordersState === 'empty' ? 0 : 2, page: number, size: 20 } }) }); return
      }
      if (url.pathname === '/api/v1/appointments/me') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [], total: 0, totalPages: 0, page: 1, size: 20 } }) }); return
      }
      await route.continue()
    })
    const screenshot = async name => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Unexpected horizontal overflow')
      await page.screenshot({ path: resolve(output, `${label}-${name}.png`) })
    }
    async function inspectControl(control, name) {
      await control.scrollIntoViewIfNeeded(); await expect(control).toBeEnabled()
      await page.mouse.move(1, 1)
      async function measure(state) {
        const data = await control.evaluate(el => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect()
          return { width: r.width, height: r.height, disabled: el.disabled, hover: el.matches(':hover'), active: el.matches(':active'), focusVisible: el.matches(':focus-visible'), color: s.color, background: s.backgroundColor, border: s.borderColor, outline: s.outline, boxShadow: s.boxShadow, transform: s.transform, text: el.textContent.trim(), ariaLabel: el.getAttribute('aria-label') }
        })
        // The target can visually scale while pressed; validate its resting hit area.
        if (state !== 'pressed') assert.ok(data.width >= 44 && data.height >= 44, `${name} ${state}: touch target below 44px`)
        assert.ok(data.text || data.ariaLabel, `${name}: missing accessible label`)
        if (state === 'focus-visible') assert.ok(data.focusVisible, `${name}: keyboard focus not visible`)
        if (state === 'pressed') assert.ok(data.active, `${name}: not actually pressed`)
        const foreground = await control.evaluate(el => {
          const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
          context.fillStyle = getComputedStyle(el).color; context.fillRect(0, 0, 1, 1)
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), rects = []
          for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim()) {
            const range = document.createRange(); range.selectNode(node)
            const box = el.getBoundingClientRect()
            for (const r of range.getClientRects()) rects.push({ x: r.x - box.x, y: r.y - box.y, width: r.width, height: r.height })
          }
          el.setAttribute('data-control-contrast-audit', '')
          return { color: [...context.getImageData(0, 0, 1, 1).data], rects }
        })
        // Capture the actual button surface without glyphs; includes gradients and filters.
        const hide = await page.addStyleTag({ content: '[data-control-contrast-audit], [data-control-contrast-audit] * { -webkit-text-fill-color: transparent !important; text-shadow: none !important; } [data-control-contrast-audit] svg { visibility: hidden !important; }' })
        const background = await control.screenshot()
        await hide.evaluate(el => el.remove())
        await control.evaluate(el => el.removeAttribute('data-control-contrast-audit'))
        const textContrast = await page.evaluate(async ({ png, foreground }) => {
          const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode()
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
          const context = canvas.getContext('2d'); context.drawImage(img, 0, 0)
          const lum = rgb => rgb.slice(0, 3).reduce((sum, v, i) => { const n = v / 255; return sum + (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i] }, 0)
          let minimum = Infinity, samples = 0
          for (const r of foreground.rects) for (let y = Math.ceil(r.y + 2); y < r.y + r.height - 2; y += 3) for (let x = Math.ceil(r.x + 2); x < r.x + r.width - 2; x += 3) {
            if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
            const bg = [...context.getImageData(x, y, 1, 1).data], alpha = foreground.color[3] / 255
            const fg = foreground.color.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha))
            const a = lum(fg), b = lum(bg)
            minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05)); samples++
          }
          return { minimum: samples ? minimum : null, samples }
        }, { png: background.toString('base64'), foreground })
        states.push({ control: name, state, ...data, textContrast })
        await screenshot(`${name}-${state}`)
        if (foreground.rects.length) assert.ok(textContrast.samples > 0 && textContrast.minimum >= 4.5, `${name} ${state}: text contrast ${textContrast.minimum}`)
      }
      await measure('default')
      await control.hover(); await measure('hover')
      await page.keyboard.press('Tab'); await control.focus(); await measure('focus-visible')
      await control.hover()
      const bounds = await control.boundingBox()
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      try { await measure('pressed') } finally { await page.mouse.move(1, 1); await page.mouse.up() }
    }
    try {
      await page.goto(`${env.baseURL}/profile`, { waitUntil: 'domcontentloaded' })
      const form = page.locator('.profile-form'), name = form.locator('input').first(), save = form.locator('button[type="submit"]')
      await expect(name).toBeVisible()
      await inspectControl(save, 'profile-save')
      const draft = locale === 'zh-CN' ? '控件验收草稿' : 'Control audit draft'
      await name.fill(draft)
      await save.click()
      await expect(save).toBeDisabled(); await expect(save).toHaveAttribute('aria-busy', 'true')
      await expect(save).toHaveAttribute('data-state', 'loading')
      await screenshot('profile-saving')
      assert.equal(mutations, 1, 'Mouse-state inspection must not have submitted the form')
      saveState = 'error'; releaseSave()
      const error = page.locator('.profile-account-panel .inline-status--error')
      await expect(error).toBeVisible(); await expect(error).toHaveAttribute('role', 'alert')
      await expect(name).toHaveValue(draft); await expect(save).toBeEnabled()
      await screenshot('profile-save-error')
      saveState = 'success'; await save.click()
      const success = page.locator('.profile-account-panel .inline-status--success')
      await expect(success).toBeVisible(); await expect(success).toHaveAttribute('role', 'status')
      await expect(error).toHaveCount(0); await expect(save).toHaveAttribute('aria-busy', 'false')
      await screenshot('profile-save-success')
      checks.push('profile-default-hover-keyboard-pressed-loading-disabled-error-retain-retry-success-announcements')

      await page.locator('.profile-records').scrollIntoViewIfNeeded()
      const orders = page.locator('.profile-record-section').filter({ has: page.locator('#profile-orders-title') })
      const refresh = orders.locator('.profile-record-retry')
      await expect(refresh).toBeDisabled()
      await expect(orders.locator('.state-panel')).toContainText(locale === 'zh-CN' ? '正在加载' : 'Loading')
      await screenshot('orders-loading')
      ordersState = 'error'; releaseOrders()
      await expect(orders.locator('.inline-status--error')).toBeVisible(); await expect(refresh).toBeEnabled()
      await screenshot('orders-error')
      ordersState = 'empty'; await refresh.click()
      await expect(orders.locator('.profile-record-link')).toBeVisible()
      await expect(orders.locator('.inline-status--error')).toHaveCount(0)
      await screenshot('orders-empty')
      ordersState = 'records'; await refresh.click()
      const pager = orders.locator('.profile-record-pagination')
      await expect(pager.locator('[aria-current="page"]')).toHaveText('1 / 2')
      await expect(pager.locator('button').first()).toBeDisabled()
      const next = pager.locator('button').last()
      await inspectControl(next, 'orders-next')
      await next.focus(); await page.keyboard.press('Enter')
      await expect(pager.locator('[aria-current="page"]')).toHaveText('2 / 2')
      await expect(next).toBeDisabled(); await expect(pager.locator('button').first()).toBeEnabled()
      await expect(orders.locator('.profile-record-kicker')).toHaveText('UI-AUDIT-ORDER-2')
      await pager.locator('button').first().focus(); await page.keyboard.press('Space')
      await expect(pager.locator('[aria-current="page"]')).toHaveText('1 / 2')
      checks.push('order-loading-error-refresh-empty-records-pagination-boundaries-enter-space')
      await inspectControl(refresh, 'orders-refresh')

      await page.goto(`${env.baseURL}/admin`, { waitUntil: 'domcontentloaded' })
      await inspectControl(page.locator('.admin-list .admin-action-button--secondary').first(), 'admin-secondary')
      await inspectControl(page.locator('.admin-list .admin-action-button--danger').first(), 'admin-danger')
      await expect(page.locator('.admin-confirm-dialog')).toHaveCount(0)
      assert.equal(mutations, 2, 'Control inspection triggered an unexpected mutation')
      checks.push('admin-secondary-danger-real-hover-keyboard-pressed-no-action')
      report.results.push({ label, passed: true, checks, states, interceptedMutations: mutations })
    } catch (error) {
      report.results.push({ label, passed: false, error: error.message, checks, states, interceptedMutations: mutations })
      await screenshot('failure').catch(() => {})
      throw error
    } finally {
      releaseSave(); releaseOrders()
      await context.close()
      await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
    }
    console.log(`${label}: ${checks.length} scenarios / ${states.length} control states passed`)
  }
  assert.equal(createHash('sha256').update(await (await fetch(env.baseURL)).text()).digest('hex'), signature, 'Served build changed during audit')
  report.complete = true
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify({ output, complete: report.complete, groups: report.results.length }))
