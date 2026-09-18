import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'

const output = resolve('../artifacts/sitewide-quality/appointment-redesign')
mkdirSync(output, { recursive: true })

test('booking text and placeholders remain readable in both themes', async ({ browser, baseURL }) => {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.addInitScript(theme => localStorage.setItem('heluo.theme', theme), theme)
    await page.goto('/appointment')
    await expect(page.locator('.appointment-day')).toHaveCount(14)
    const contrasts = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const rgba = (color: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1, 1)
        return Array.from(ctx.getImageData(0, 0, 1, 1).data)
      }
      const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
        const v = value / 255
        return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0)
      return ['.appointment-heading__intro', '.appointment-progress li', '.appointment-section__heading h2 > span', '.appointment-summary dt', '.appointment-privacy', '.appointment-field input'].map(selector => {
        const element = document.querySelector<HTMLElement>(selector)!
        let ancestor: HTMLElement | null = element
        let background = [255, 255, 255, 255]
        while (ancestor) {
          const candidate = rgba(getComputedStyle(ancestor).backgroundColor)
          if (candidate[3] === 255) { background = candidate; break }
          ancestor = ancestor.parentElement
        }
        const foreground = rgba(getComputedStyle(element, element.matches('input') ? '::placeholder' : null).color)
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
        return { selector, ratio: (values[0]! + .05) / (values[1]! + .05) }
      })
    })
    for (const item of contrasts) expect(item.ratio, `${theme} ${item.selector}: ${item.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    await context.close()
  }
})

test('appointment layout remains usable across themes, languages and viewports', async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  for (const width of [320, 390, 540, 760, 900, 1440]) {
    for (const theme of ['light', 'dark']) {
      for (const locale of ['zh-CN', 'en-US']) {
        const context = await browser.newContext({ baseURL, viewport: { width, height: 900 }, reducedMotion: 'reduce' })
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.addInitScript(({ theme, locale }) => {
          localStorage.setItem('heluo.theme', theme)
          localStorage.setItem('heluo.locale', locale)
        }, { theme, locale })
        await page.goto('/appointment')
        await expect(page.locator('.appointment-day')).toHaveCount(14)
        await page.locator('.appointment-day:not(:disabled)').first().click()
        await expect(page.locator('.appointment-time.active')).toBeVisible()
        const metrics = await page.evaluate(() => {
          const elements = [...document.querySelectorAll<HTMLElement>('.appointment-day, .appointment-time, .appointment-quantity button, .appointment-field input, .appointment-account-link')]
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            small: elements.filter(element => {
              const rect = element.getBoundingClientRect()
              return rect.width > 0 && (rect.width < 44 || rect.height < 44)
            }).map(element => element.className),
            clipped: elements.filter(element => !element.matches('input') && element.scrollWidth > element.clientWidth + 1).map(element => element.className),
          }
        })
        expect(metrics, `${width}/${theme}/${locale}`).toEqual({ overflow: false, small: [], clipped: [] })
        const image = page.locator('.appointment-venue img')
        await image.scrollIntoViewIfNeeded()
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: resolve(output, `${width}-${theme}-${locale}.png`), fullPage: true })
        expect(errors).toEqual([])
        await context.close()
      }
    }
  }
})

test('mobile contact sheet keeps values, returns focus and submits after login', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8)
  const visitor = { username: `appt_${suffix}`, password: randomBytes(24).toString('base64url'), nickname: '界面验收', email: `appt-${suffix}@example.test` }
  const registration = await request.post('/api/v1/auth/register', { data: visitor })
  expect(registration.ok()).toBeTruthy()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('heluo.theme', 'light')
    localStorage.setItem('heluo.locale', 'zh-CN')
  })
  await page.goto('/appointment')
  const trigger = page.getByRole('button', { name: '填写预约信息', exact: true })
  await expect(trigger).toBeDisabled()
  await page.locator('.appointment-day:not(:disabled)').first().click()
  await trigger.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByLabel('联系人姓名', { exact: true }).fill('界面验收')
  await sheet.getByLabel('联系人手机号', { exact: true }).fill('13800000000')
  await sheet.getByLabel('联系人邮箱', { exact: true }).fill(visitor.email)
  await sheet.getByRole('button', { name: '增加参与人数', exact: true }).click()
  await expect(sheet.getByRole('spinbutton', { name: '参与人数', exact: true })).toHaveValue('2')
  await expect.poll(async () => (await sheet.boundingBox())?.y ?? 844).toBeLessThan(100)
  await page.screenshot({ path: resolve(output, 'mobile-contact-sheet.png') })
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(sheet.getByLabel('联系人姓名', { exact: true })).toHaveValue('界面验收')
  await expect(sheet.getByRole('spinbutton', { name: '参与人数', exact: true })).toHaveValue('2')
  await sheet.getByRole('button', { name: '确认预约', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('用户名', { exact: true }).fill(visitor.username)
  await page.locator('input[autocomplete="current-password"]').fill(visitor.password)
  await page.locator('.auth-panel form').getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/appointment$/)
  await page.getByRole('button', { name: '填写预约信息', exact: true }).click()
  await expect(sheet.getByLabel('联系人手机号', { exact: true })).toHaveValue('13800000000')
  await expect(sheet.getByRole('spinbutton', { name: '参与人数', exact: true })).toHaveValue('2')
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/v1/appointments') && response.request().method() === 'POST')
  await sheet.getByRole('button', { name: '确认预约', exact: true }).click()
  const created = (await (await submitted).json()).data as { appointmentNo: string }
  await expect(sheet.getByText(/预约已提交/)).toBeVisible()
  await sheet.getByRole('link', { name: '查看我的预约', exact: true }).click()
  await page.locator('.profile-records').scrollIntoViewIfNeeded()
  await expect(page.locator('.profile-record-card').filter({ hasText: created.appointmentNo })).toContainText('2 人')
})
