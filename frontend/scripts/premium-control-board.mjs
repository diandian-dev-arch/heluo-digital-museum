import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('../artifacts/premium-visual-2026-09-10/controls')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, reducedMotion: 'reduce' })
    await context.addInitScript(theme => localStorage.setItem('heluo.theme', theme), theme)
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4189/login', { waitUntil: 'domcontentloaded' })
    await page.locator('form .fluid-button').waitFor()
    await page.evaluate(() => {
      const button = document.querySelector('form .fluid-button').cloneNode(true)
      const main = document.querySelector('#main-content')
      main.replaceChildren()
      main.style.cssText = 'padding:40px;background:var(--theme-surface-canvas);min-height:900px'
      const heading = document.createElement('h1')
      heading.textContent = '共享控件状态板 · 真实构建样式'
      main.append(heading)
      const note = document.createElement('p')
      note.textContent = '视觉测试夹具，复用已渲染按钮和正式 CSS；不代表业务提交。'
      main.append(note)
      for (const state of ['default', 'hover', 'focus-visible', 'pressed', 'disabled', 'loading', 'error', 'success']) {
        const row = document.createElement('section')
        row.style.cssText = 'display:grid;grid-template-columns:180px 280px;gap:24px;align-items:center;margin:22px 0'
        const label = document.createElement('span')
        label.textContent = state
        const control = button.cloneNode(true)
        control.id = `board-${state}`
        control.type = 'button'
        control.disabled = ['disabled', 'loading'].includes(state)
        control.dataset.state = ['loading', 'error', 'success'].includes(state) ? state : 'idle'
        control.setAttribute('aria-busy', String(state === 'loading'))
        control.querySelector('.fluid-button__label').textContent = ({ loading: '正在保存', error: '保存失败，请重试', success: '已保存' })[state] || '保存更改'
        if (state === 'loading') {
          const spinner = document.createElement('span'); spinner.className = 'fluid-button__spinner'; spinner.setAttribute('aria-hidden', 'true'); control.prepend(spinner)
        }
        if (['error', 'success'].includes(state)) {
          const icon = document.createElement('span'); icon.textContent = state === 'success' ? '✓' : '!'; icon.setAttribute('aria-hidden', 'true'); control.prepend(icon)
        }
        row.append(label, control)
        main.append(row)
      }
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    for (const [state, pseudo] of [['hover', 'hover'], ['focus-visible', 'focus-visible'], ['pressed', 'active']]) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#board-${state}` })
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [pseudo] })
    }
    results.push({ theme, states: await page.locator('[id^="board-"]').evaluateAll(buttons => buttons.map(button => {
      const css = getComputedStyle(button)
      return { state: button.id, disabled: button.disabled, busy: button.getAttribute('aria-busy'), color: css.color, background: css.backgroundColor, border: css.borderColor, outline: css.outlineStyle, height: button.getBoundingClientRect().height }
    })) })
    await page.screenshot({ path: resolve(output, `${theme}.png`), fullPage: true })
    await context.close()
  }
} finally { await browser.close() }
await writeFile(resolve(output, 'summary.json'), JSON.stringify({ fixture: 'Rendered production button cloned into an isolated visual fixture; pseudo states forced through CDP', results }, null, 2))
console.log('Captured 8 control states in both themes')
