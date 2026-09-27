// Supplement axe's overlap/incomplete results with the pixels actually behind
// visible text. This measures the current viewport, not off-screen content.
export async function measureFeedbackContrast(page, selector) {
  const samples = await page.locator(selector).evaluate(panel => {
    const color = document.createElement('canvas').getContext('2d')
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
    const samples = []
    while (walker.nextNode()) {
      const node = walker.currentNode, el = node.parentElement
      if (!node.textContent.trim() || !el || el.closest('svg, i, script, style, button:disabled, input:disabled')) continue
      const style = getComputedStyle(el)
      if (style.visibility !== 'visible' || !el.getClientRects().length) continue
      const range = document.createRange(); range.selectNodeContents(node)
      let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, opacity = 1
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect()
        opacity *= Number(css.opacity)
        if (/(hidden|auto|scroll|clip)/.test(css.overflowX)) { clip.left = Math.max(clip.left, rect.left); clip.right = Math.min(clip.right, rect.right) }
        if (/(hidden|auto|scroll|clip)/.test(css.overflowY)) { clip.top = Math.max(clip.top, rect.top); clip.bottom = Math.min(clip.bottom, rect.bottom) }
      }
      const rects = [...range.getClientRects()].map(rect => ({ left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top), right: Math.min(rect.right, clip.right), bottom: Math.min(rect.bottom, clip.bottom) })).filter(rect => rect.right - rect.left > 4 && rect.bottom - rect.top > 4)
      if (!rects.length || opacity === 0) continue
      color.clearRect(0, 0, 1, 1); color.fillStyle = style.color; color.fillRect(0, 0, 1, 1)
      const foreground = [...color.getImageData(0, 0, 1, 1).data]; foreground[3] *= opacity
      samples.push({ text: node.textContent.trim(), foreground, rects, threshold: parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5 })
    }
    return samples
  })
  const hidden = await page.addStyleTag({ content: `${selector}, ${selector} * { -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }` })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  let screenshot
  try { screenshot = await page.screenshot() } finally { await hidden.evaluate(el => el.remove()) }
  return page.evaluate(async ({ data, samples }) => {
    const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    const luminance = rgb => rgb.slice(0, 3).reduce((sum, value, i) => {
      const n = value / 255
      return sum + (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
    }, 0)
    return samples.map(sample => {
      let minimum = Infinity, count = 0
      for (const r of sample.rects) for (let y = r.top + 1; y < r.bottom - 1; y += 3) for (let x = r.left + 1; x < r.right - 1; x += 3) {
        const bg = [...ctx.getImageData(x, y, 1, 1).data], alpha = sample.foreground[3] / 255
        const fg = sample.foreground.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha))
        const a = luminance(fg), b = luminance(bg)
        minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05)); count++
      }
      return { text: sample.text, foreground: sample.foreground, minimum, threshold: sample.threshold, count }
    })
  }, { data: screenshot.toString('base64'), samples })
}
