import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { measureFeedbackContrast } from './premium-feedback-contrast.mjs'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4201'
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const environmentFile = process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/pocketbay-environment.json'
const env = JSON.parse(await readFile(environmentFile, 'utf8'))
const login = await fetch(`${baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert.equal(login.status, 200)
const token = (await login.json()).data.accessToken
const productsResponse = await fetch(`${baseURL}/api/v1/products`)
assert.equal(productsResponse.status, 200)
const products = (await productsResponse.json()).data
const product = products.find(item => item.slug === 'river-map-notebook')
assert.ok(product)
const output = resolve('../artifacts/premium-visual-2026-09-10/cart-feedback')
await mkdir(output, { recursive: true })
const report = { complete: false, baseURL, buildSignature: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const locale of ['zh-CN', 'en-US']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, locale, token }) => {
      localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', locale); localStorage.setItem('heluo.access-token', token)
    }, { theme, locale, token })
    const page = await context.newPage()
    const label = `${width}-${theme}-${locale}`, english = locale === 'en-US'
    const result = { label, checks: [], screenshots: [], writes: [], accessibility: [] }
    report.current = result
    let release, mode = 'pending', reads = 0, orderCreates = 0, paymentAttempts = 0
    let hold = new Promise(resolve => { release = resolve })
    let cart = [{ ...product, id: 910001, productId: product.id, quantity: 1, availableStock: 6 }]
    const order = { id: 910002, orderNo: 'UI-AUDIT-NOT-A-REAL-ORDER', payableAmount: String(Number(product.price) * 2), status: 'PENDING' }
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
      const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { data } : { message: english ? 'Temporary problem. Please try again.' : '暂时无法完成，请重试。' }) })
      if (method === 'GET' && path.endsWith('/cart')) {
        reads++
        if (mode === 'pending') await hold
        return respond(cart, mode === 'error' ? 503 : 200)
      }
      if (method === 'GET' && path.endsWith(`/orders/${order.id}`)) return respond(order)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        result.writes.push({ path, method, key: request.headers()['idempotency-key'] ?? null })
        if (path.endsWith(`/cart/items/${cart[0]?.id}`) && method === 'PATCH') {
          if (mode === 'pending') await hold
          if (mode === 'error') return respond(null, 503)
          cart = [{ ...cart[0], quantity: request.postDataJSON().quantity }]
          return respond(cart)
        }
        if (path.endsWith('/orders') && method === 'POST') { orderCreates++; return respond(order) }
        if (path.endsWith(`/orders/${order.id}/mock-payment`)) {
          paymentAttempts++
          if (mode === 'pending') await hold
          return respond({}, mode === 'error' ? 503 : 200)
        }
        throw new Error(`Unexpected intercepted write: ${method} ${path}`)
      }
      return route.continue()
    })
    const panel = page.locator(width === 390 ? '.bottom-sheet .cart-experience' : '.cart-panel .cart-experience')
    const shot = async name => {
      await panel.scrollIntoViewIfNeeded()
      if (width === 390) await page.locator('.bottom-sheet-content').evaluate(el => { el.scrollTop = 0 })
      await page.waitForTimeout(350)
      await page.screenshot({ path: resolve(output, `${label}-${name}.png`) })
      result.screenshots.push(name)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    }
    const auditStatus = async (name, kind) => {
      const status = panel.getByRole(kind)
      await expect(status).toBeVisible()
      await expect(page.getByRole(kind)).toHaveCount(1)
      assert.ok((await status.innerText()).length > 5)
      await page.addScriptTag({ path: resolve('../artifacts/testing-tools/node_modules/axe-core/axe.min.js') })
      const contrast = await page.evaluate(async selector => {
        const result = await window.axe.run(document.querySelector(selector), { runOnly: { type: 'rule', values: ['color-contrast'] } })
        return { violations: result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: result.incomplete.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })) }
      }, width === 390 ? '.bottom-sheet' : '.cart-panel')
      await shot(name)
      const measured = await measureFeedbackContrast(page, width === 390 ? '.bottom-sheet' : '.cart-panel')
      result.accessibility.push({ name, ...contrast, measured })
      assert.equal(contrast.violations.length, 0, JSON.stringify(contrast))
      assert.ok(measured.length >= 3 && measured.every(sample => sample.count && sample.minimum >= sample.threshold), JSON.stringify(measured))
      if (width === 390) {
        const surface = await page.locator('.bottom-sheet').evaluate(el => {
          const style = getComputedStyle(el), ctx = document.createElement('canvas').getContext('2d')
          ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, 1, 1)
          return { alpha: ctx.getImageData(0, 0, 1, 1).data[3], image: style.backgroundImage }
        })
        assert.equal(surface.alpha, 255); assert.equal(surface.image, 'none')
      }
      const note = panel.locator('.cart-payment-note')
      if (await note.count()) {
        await note.scrollIntoViewIfNeeded()
        await page.waitForTimeout(350)
        const lower = await measureFeedbackContrast(page, width === 390 ? '.bottom-sheet' : '.cart-panel')
        result.accessibility.push({ name: `${name}-lower`, measured: lower })
        assert.ok(lower.some(sample => sample.text.includes(english ? 'demonstration' : '演示结算')))
        assert.ok(lower.every(sample => sample.count && sample.minimum >= sample.threshold), JSON.stringify(lower))
        await page.screenshot({ path: resolve(output, `${label}-${name}-lower.png`) })
        result.screenshots.push(`${name}-lower`)
      }
    }
    await page.goto(`${baseURL}/shop`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.product-grid')).toBeVisible()
    if (width === 390) await page.locator('.mobile-cart-trigger').click()
    await shot('cart-loading')
    result.initialText = await panel.innerText()
    await expect(panel).toContainText(english ? 'Loading your shopping bag' : '正在加载购物袋')
    await expect(panel).not.toContainText(english ? 'Your shopping bag is empty' : '购物袋还是空的')
    mode = 'error'; release()
    const retry = panel.getByRole('button', { name: english ? 'Reload shopping bag' : '重新加载购物袋', exact: true })
    await expect(retry).toBeVisible()
    await auditStatus('cart-load-error', 'alert')
    mode = 'success'; await retry.click()
    await expect(panel.locator('.cart-item')).toHaveCount(1)
    assert.equal(reads, 2)
    result.checks.push('loading-is-not-empty; load-error-is-announced; retry-reads-current-cart')
    const increase = panel.getByRole('button', { name: english ? 'Increase quantity' : '增加数量', exact: true })
    mode = 'pending'; hold = new Promise(resolve => { release = resolve })
    await increase.click()
    await expect(increase).toBeDisabled()
    await expect(panel.locator('button[type=submit]')).toBeDisabled()
    await shot('quantity-pending')
    mode = 'error'; release()
    await expect(increase).toBeEnabled()
    await expect(panel.locator('.quantity b')).toHaveText('1')
    await auditStatus('quantity-error', 'alert')
    mode = 'success'; await increase.click()
    await expect(panel.locator('.quantity b')).toHaveText('2')
    result.checks.push('quantity-pending-lock; failure-retains-quantity; retry-success')
    await panel.locator('input[type=email]').fill('visual-audit@example.test')
    mode = 'pending'; hold = new Promise(resolve => { release = resolve })
    await panel.locator('button[type=submit]').click()
    await expect(panel.locator('.cart-empty-state button')).toBeDisabled()
    await shot('payment-pending')
    mode = 'error'; release()
    const payRetry = panel.getByRole('button', { name: english ? 'Continue mock payment' : '继续模拟支付', exact: true })
    await expect(payRetry).toBeEnabled()
    await auditStatus('payment-error', 'alert')
    mode = 'success'; await payRetry.click()
    await expect(panel).toContainText(english ? 'Order completed' : '订单已完成')
    await auditStatus('payment-success', 'status')
    assert.equal(orderCreates, 1); assert.equal(paymentAttempts, 2)
    const paymentKeys = result.writes.filter(write => write.path.endsWith('/mock-payment')).map(write => write.key)
    assert.ok(paymentKeys[0]); assert.equal(paymentKeys[0], paymentKeys[1])
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('heluo.pending-checkout.')).length), 0)
    result.checks.push('payment-pending-lock; error-recovery; same-payment-key; single-order; success-clears-recovery')
    if (width === 390) {
      await page.keyboard.press('Escape')
      await expect(page.locator('.mobile-cart-trigger')).toBeFocused()
      result.checks.push('sheet-escape-restores-trigger')
      await page.locator('.mobile-cart-trigger').click()
      await expect(page.locator('.bottom-sheet-close')).toHaveAccessibleName(english ? 'Close panel' : '关闭面板')
      await page.emulateMedia({ forcedColors: 'active' })
      await page.locator('.bottom-sheet-handle').focus()
      await shot('forced-colors', panel)
      await expect(page.locator('.bottom-sheet-handle')).toBeFocused()
      await page.emulateMedia({ forcedColors: 'none' })
      await panel.locator('.cart-empty-state a').click()
      await expect(page.locator('.bottom-sheet')).toHaveCount(0)
      await expect(page.locator('#shop-products')).toBeFocused()
      result.checks.push('continue-browsing-returns-to-products')
    }
    report.results.push(result); delete report.current
    await context.close()
  }
  report.complete = true
} catch (error) {
  report.error = String(error)
  throw error
} finally {
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ complete: report.complete, groups: report.results.length, buildSignature: report.buildSignature }))
