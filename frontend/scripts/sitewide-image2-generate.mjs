import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, 'artifacts/sitewide-image2-upgrade')
const manifestPath = resolve(output, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const helper = resolve(process.env.USERPROFILE, '.codex/skills/soloapi-image2/scripts/bin/soloapi-image2-windows-amd64.exe')
const selected = process.argv.slice(2).find(value => !value.startsWith('--'))
const jobs = manifest.pages.flatMap(page => page.captures.filter(capture => capture.width === 1440).map(capture => ({ page, capture })))
for (const { page, capture } of jobs) {
  const id = `${page.id}-${capture.theme === 'dark' ? 'dark' : 'light'}-${capture.width === 1440 ? 'desktop' : 'mobile'}`
  if (selected && id !== selected) continue
  const target = resolve(output, `outputs/${id}.png`)
  const themeText = capture.theme === 'dark' ? '夜间深墨展厅：近黑墨绿画布、暖象牙文字、低面积古铜金主操作，保留层次与可读性。' : '日间月白展厅：近中性明亮画布、深墨正文、青玉实色主操作，少量古铜和朱砂状态。'
  if (page.id === 'home') page.direction += ' 首页必须有明显升级：青铜鼎成为首屏视觉锚点并占据画面中心偏右的三分之一，左侧标题采用更有张力的两级排版，主按钮形成清晰视觉落点；路线入口整合为精致导览目录，首屏下方用策展横向内容带承接馆藏，不使用普通卡片墙。整体让首次访问者产生想进入博物馆探索的冲动，同时保持克制、高级、可信。'
  const prompt = `请根据两张未经拉伸的真实网页截图，为「河洛数字博物馆 · ${page.title}」生成一张高质量优化效果图。第一张是当前${capture.width === 1440 ? '桌面1440×1000 CSS像素，原图2880×2000像素' : '手机390×844 CSS像素，原图780×1688像素'}${capture.theme === 'dark' ? '深色主题' : '浅色主题'}首屏，第二张是同一页面向下自然滚动后的连续内容，仅补充上下文。两图不是左右拼接图片。\n\n只输出一个${capture.width === 1440 ? '横向桌面' : '纵向手机'}页面视图，保持第一张原始比例。不得把长页压扁，不得横向拉伸手机，不得拼四宫格、设备外壳、浏览器边框、透视或海报。页面可在底部自然延续，首屏露出下一节；画面中的内容按真实浏览器的字号和布局呈现，文物保持原始比例，不以适应画布为由压缩图文。\n\n本页要求：${page.direction}\n真实标题：${capture.headings.join('；')}\n真实控件：${capture.controls.join('；')}\n\n统一主题：${themeText} 保留真实文物图片与河洛身份，图片不重新捏造纹样；不要米黄、浓绿底或装饰渐变。系统宋体仅用于策展标题，微软雅黑用于任务正文、标签和表格；字间距0。桌面任务标题36px、手机28px、正文16px、辅助文字至少14px；桌面1200px版心，手机16至20px侧边距，4px间距体系，最大8px圆角，44px触控目标。\n\n以清楚信息层级、真实媒体、自然留白、熟悉控件和克制细线形成高级感。正文和表单清晰实色，玻璃只用于必要导航浮层。严禁卡片套卡片、发光圆球、营销口号、虚构统计或不存在功能。截图中的账户与后台数据来自隔离测试环境。优化应保留全部业务能力，以真实内容为准。\n\n这是一张可由Vue和CSS实现的精致前端设计效果图。只呈现升级后的页面，不写设计说明，不增加水印；文字清楚、排版自然、图像无变形。`
  await writeFile(resolve(root, `docs/design/2026-09-08-sitewide-image2/${id}.md`), `# ${page.title} · ${capture.width === 1440 ? '桌面' : '手机'}\n\n${prompt}\n`)
  if (process.argv.includes('--prompts-only')) continue
  if (!existsSync(target)) {
    const args = ['edit', '--prompt', prompt, '--image', resolve(output, capture.screenshot), '--image', resolve(output, capture.continuation), '--out', target, '--yes']
    console.log(`${id}: generating from native-resolution screenshots`)
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(helper, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.on('error', reject)
      child.on('close', code => resolveResult({ code, stdout, stderr }))
    })
    await writeFile(resolve(output, `outputs/${id}-result.json`), JSON.stringify(result, null, 2))
    if (result.code !== 0) {
      throw new Error(`${id}: generation failed; see ${id}-result.json. No automatic retry.`)
    }
  }
  const bytes = await readFile(target)
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${page.id}: invalid PNG`)
  const generated = { id, status: 'generated-awaiting-review', prompt, input: [capture.screenshot, capture.continuation], output: target, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length }
  await writeFile(resolve(output, `outputs/${id}-evidence.json`), JSON.stringify(generated, null, 2))
  console.log(`${id}: verified PNG ${generated.width}x${generated.height}`)
}
