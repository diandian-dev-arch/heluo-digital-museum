import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const baseURL = process.env.HELUO_BASE_URL ?? 'http://127.0.0.1:4199'
assert.equal(new URL(baseURL).hostname, '127.0.0.1')
const environmentFile = process.env.HELUO_ENVIRONMENT_FILE ?? '../artifacts/sitewide-quality/docker-environment.json'
const env = JSON.parse(await readFile(environmentFile, 'utf8'))
const login = await fetch(`${baseURL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env.admin) })
assert.equal(login.status, 200)
const token = (await login.json()).data.accessToken
const output = resolve('../artifacts/premium-visual-2026-09-10/admin-feedback')
await mkdir(output, { recursive: true })
const report = { complete: false, baseURL, environmentFile, buildSignature: createHash('sha256').update(await readFile('dist/index.html')).digest('hex'), results: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ theme, token }) => {
      localStorage.setItem('heluo.theme', theme); localStorage.setItem('heluo.locale', 'zh-CN'); localStorage.setItem('heluo.access-token', token)
    }, { theme, token })
    const page = await context.newPage()
    const label = `${width}-${theme}`
    const checks = [], contrast = [], failures = []
    page.on('response', response => { if (response.status() >= 400) failures.push({ path: new URL(response.url()).pathname, status: response.status() }) })
    let release, listMode = 'pending', mutationMode = 'pending', mutationCount = 0
    let hold = new Promise(resolve => { release = resolve })
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        mutationCount++
        if (mutationMode === 'pending') await hold
        await route.fulfill({ status: mutationMode === 'success' ? 200 : 503, contentType: 'application/json', body: JSON.stringify(mutationMode === 'success' ? { data: {} } : { message: '验收模拟：暂时无法保存，请重试。' }) })
        return
      }
      if (/\/admin\/(artifacts|users)$/.test(url.pathname)) {
        if (listMode === 'pending') await hold
        if (listMode === 'error') { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '验收模拟：列表暂时无法加载。' }) }); return }
        if (listMode === 'empty') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [], total: 0, totalPages: 0, page: 1, size: 20 } }) }); return }
      }
      await route.continue()
    })
    const shot = async (name, target) => {
      await target.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
      await page.screenshot({ path: resolve(output, `${label}-${name}.png`) })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    }
    for (const path of ['/admin', '/admin/operations']) {
      listMode = 'pending'; hold = new Promise(resolve => { release = resolve })
      await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      const pending = page.locator('.state-panel').filter({ hasText: /正在加载/ }).first()
      await expect(pending).toBeVisible(); await shot(`${path.replaceAll('/', '-')}-loading`, pending)
      listMode = 'error'; release()
      const retry = page.getByRole('button', { name: '重试', exact: true })
      await expect(retry).toBeVisible(); await shot(`${path.replaceAll('/', '-')}-error`, retry)
      listMode = 'empty'; await retry.click()
      const empty = page.locator('.state-panel').filter({ hasText: /暂无内容|暂无记录/ }).first()
      await expect(empty, JSON.stringify(failures)).toBeVisible(); await shot(`${path.replaceAll('/', '-')}-empty`, empty)
      listMode = 'live'; await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('.admin-list article').first()).toBeVisible()
      checks.push(`${path}: loading-error-retry-empty-live`)
    }
    await page.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded' })
    await page.locator('.admin-list article').first().getByRole('button', { name: '编辑', exact: true }).click()
    const form = page.locator('.admin-create form')
    const title = form.getByLabel('标题', { exact: true })
    const previous = await title.inputValue()
    await title.fill(`${previous}（界面验收）`)
    const save = form.getByRole('button', { name: '保存修改', exact: true })
    mutationMode = 'pending'; hold = new Promise(resolve => { release = resolve })
    await save.click()
    await expect(form).toHaveAttribute('inert', '')
    await shot('save-pending', form)
    mutationMode = 'error'; release()
    await expect(page.locator('.inline-status--error')).toContainText('暂时无法保存')
    await expect(title).toHaveValue(`${previous}（界面验收）`)
    await shot('save-error', page.locator('.inline-status--error'))
    mutationMode = 'success'; await save.click()
    await expect(page.locator('.inline-status--success')).toContainText('内容已更新')
    await shot('save-success', page.locator('.inline-status--success'))
    checks.push('edit-pending-inert-error-retains-input-retry-success')

    // Confirmation is tested against intercepted responses; nothing is withdrawn.
    const withdraw = page.locator('.admin-list article').filter({ has: page.getByRole('button', { name: '撤回', exact: true }) }).first().getByRole('button', { name: '撤回', exact: true })
    await withdraw.click()
    const dialog = page.locator('.admin-confirm-dialog')
    const auditDialog = async state => {
      await page.addScriptTag({ path: resolve('../artifacts/testing-tools/node_modules/axe-core/axe.min.js') })
      const result = await page.evaluate(async () => {
        const panel = document.querySelector('.admin-confirm-dialog')
        const styles = getComputedStyle(panel)
        const report = await window.axe.run(panel, { runOnly: { type: 'rule', values: ['color-contrast'] } })
        const compact = items => items.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary, checks: [...node.any, ...node.all, ...node.none].map(check => ({ id: check.id, data: check.data })) })) }))
        return { background: styles.backgroundColor, backgroundImage: styles.backgroundImage, violations: compact(report.violations), incomplete: compact(report.incomplete), passedNodes: report.passes.flatMap(item => item.nodes).length }
      })
      contrast.push({ state, ...result })
      assert.equal(result.backgroundImage, 'none', `${label} ${state}: stable modal face`)
      assert.equal(result.violations.length, 0, JSON.stringify(result))
      // axe can report the modal message as overlapping its backdrop. Measure
      // actual rendered background pixels as well, retaining its incomplete result.
      const samples = await dialog.evaluate(panel => {
        const ctx = document.createElement('canvas').getContext('2d')
        return [...panel.querySelectorAll('h2, p, button:not(:disabled)')].map(el => {
          const style = getComputedStyle(el)
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = style.color; ctx.fillRect(0, 0, 1, 1)
          const foreground = [...ctx.getImageData(0, 0, 1, 1).data]
          const range = document.createRange(); range.selectNodeContents(el)
          const rects = [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))
          return { text: el.textContent.trim(), foreground, rects, threshold: parseFloat(style.fontSize) >= 24 ? 3 : 4.5 }
        })
      })
      const hiddenText = await page.addStyleTag({ content: '.admin-confirm-dialog * { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const background = await page.screenshot()
      await hiddenText.evaluate(el => el.remove())
      const measured = await page.evaluate(async ({ data, samples }) => {
        const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode()
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
        const luminance = rgb => rgb.slice(0, 3).reduce((sum, value, i) => {
          const n = value / 255
          return sum + (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
        }, 0)
        return samples.map(sample => {
          let minimum = Infinity, count = 0
          for (const r of sample.rects) for (let y = Math.ceil(r.y + 2); y < r.y + r.height - 2; y += 3) for (let x = Math.ceil(r.x + 2); x < r.x + r.width - 2; x += 3) {
            const bg = [...ctx.getImageData(x, y, 1, 1).data], alpha = sample.foreground[3] / 255
            const fg = sample.foreground.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha))
            const a = luminance(fg), b = luminance(bg)
            minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05)); count++
          }
          return { text: sample.text, minimum, threshold: sample.threshold, count }
        })
      }, { data: background.toString('base64'), samples })
      contrast.at(-1).measured = measured
      report.current = { label, contrast }
      await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
      assert.ok(measured.length >= 3 && measured.every(sample => sample.count > 0 && sample.minimum >= sample.threshold), JSON.stringify(measured))
    }
    await expect(dialog.locator('[data-confirm-cancel]')).toBeFocused()
    await auditDialog('default'); await shot('confirmation-default', dialog)
    await dialog.locator('[data-confirm-primary]').hover()
    await auditDialog('hover')
    await page.keyboard.press('Shift+Tab')
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)))
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0); await expect(withdraw).toBeFocused()
    await withdraw.click()
    mutationMode = 'pending'; hold = new Promise(resolve => { release = resolve })
    await dialog.locator('[data-confirm-primary]').click()
    await expect(dialog.locator('[data-confirm-primary]')).toBeDisabled()
    await page.keyboard.press('Tab')
    const trapped = await dialog.evaluate(el => el.contains(document.activeElement))
    await shot('confirmation-pending', dialog)
    await auditDialog('pending')
    mutationMode = 'error'; release()
    assert.ok(trapped, 'Pending confirmation must keep keyboard focus inside the modal')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.inline-status--error')).toContainText('暂时无法保存')
    await expect(withdraw).toBeFocused()
    await shot('confirmation-failure', page.locator('.inline-status--error'))
    checks.push('confirmation-cancel-focus-restoration-and-pending-focus-trap')

    await page.locator('.admin-list article').first().getByRole('button', { name: '编辑', exact: true }).click()
    const unsavedTitle = `${await title.inputValue()}（未保存验收）`
    await title.fill(unsavedTitle)
    const articlesTab = page.getByRole('tab', { name: '文章', exact: true })
    await articlesTab.click()
    await expect(dialog.locator('button')).toHaveCount(3)
    await auditDialog('unsaved-three-actions')
    assert.ok(await dialog.locator('button').evaluateAll(buttons => buttons.every(button => {
      const r = button.getBoundingClientRect()
      return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
    })), 'All three unsaved actions must fit and remain reachable')
    mutationMode = 'error'
    await dialog.locator('[data-confirm-primary]').click()
    await expect(dialog.getByRole('alert')).toContainText('暂时无法保存')
    await expect(dialog.locator('[data-confirm-cancel]')).toBeFocused()
    await auditDialog('unsaved-save-error'); await shot('unsaved-save-error', dialog)
    await dialog.locator('[data-confirm-cancel]').click()
    await expect(dialog).toHaveCount(0); await expect(title).toHaveValue(unsavedTitle)
    await expect(page.getByRole('tab', { name: '文物', exact: true })).toHaveAttribute('aria-selected', 'true')
    checks.push('unsaved-three-actions-save-error-keeps-draft-and-continue-editing')

    await articlesTab.click()
    await page.emulateMedia({ forcedColors: 'active' })
    await shot('unsaved-forced-colors', dialog)
    await page.keyboard.press('Shift+Tab')
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)))
    await dialog.locator('[data-confirm-secondary]').click()
    await expect(dialog).toHaveCount(0)
    await expect(articlesTab).toHaveAttribute('aria-selected', 'true')
    checks.push('unsaved-forced-colors-focus-and-discard-local-draft')
    report.results.push({ label, checks, contrast, interceptedMutations: mutationCount, failures })
    delete report.current
    await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
    await context.close()
    console.log(`${label}: ${checks.length} checks passed`)
  }
  report.complete = true
} finally {
  await browser.close()
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(report, null, 2))
}
console.log(JSON.stringify({ complete: report.complete, scenarios: report.results.length }))
