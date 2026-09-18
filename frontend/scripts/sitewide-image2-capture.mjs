import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(root, 'artifacts/sitewide-image2-upgrade')
const docs = resolve(root, 'docs/design/2026-09-08-sitewide-image2')
const env = JSON.parse(await readFile(resolve(root, 'artifacts/sitewide-quality/current-environment.json'), 'utf8'))
await mkdir(resolve(output, 'inputs-native'), { recursive: true })
await mkdir(resolve(output, 'outputs'), { recursive: true })
await mkdir(docs, { recursive: true })
async function api(path, body) {
  const response = await fetch(`${env.baseURL}/api/v1${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()).data
}
const artifacts = await api('/artifacts?page=1&size=12')
const articles = await api('/articles?page=1&size=12')
const exhibits = await api('/exhibits')
const admin = await api('/auth/login', env.admin)
const pages = [
  ['home', '/', '首页', '保留馆廊与中央青铜鼎的真实主视觉，让河洛数字博物馆标题、探索馆藏与数字展厅入口清楚，首屏底部露出下一节。优化导航、图文对比、首屏节奏、下方真实馆藏和参观入口。避免加数据指标、营销口号或重复功能卡。'],
  ['explore', '/explore', '探索馆藏', '紧凑标题与搜索分类行；一件重点器物配四件次级器物，完整保留器物轮廓、纹理和展签。分类、时代、搜索、分页可辨认；下方主题索引和文章列表有清楚阅读顺序。手机优先搜索和真实器物，减少重复分隔与空白。'],
  ['artifact', `/artifacts/${artifacts.items[0].slug}`, '文物故事', '以真实器物名称、时代、分类、正文和图片为中心，主图可检查细节，标题不盖住文物。优化面包屑、元信息、正文宽度、段落节奏与关联入口；不可捏造出处、年代、收藏机构或新增鉴定信息。'],
  ['article', `/articles/${articles.items[0].slug}`, '文化专题', '构建可舒适阅读的专题页，主次标题、目录、正文、图片说明和相关推荐层级分明；桌面目录轻量侧置，移动端自然进入正文。正文宽度约65个字符，复用实际图片和文章，禁止把长文做成多层卡片。'],
  ['exhibits', '/exhibits', '数字展厅', '突出真实展项封面与展项名称，明确进入展项操作，减少介绍区高度使真实展品首屏可见。展示可用信息但不编造模型数量或开放状态。手机封面保持主体完整并提供足够大的操作区域。'],
  ['exhibit', `/exhibits/${exhibits[0].slug}`, '3D数字展项', '展项舞台无装饰外框，以实际文物和可用控件为准；清晰安排返回、主题、实体/点云、视角和说明，不在文物主体上叠放操作。保留未启动封面、启动入口、加载失败重试和移动端低负载入口，不能把静态图假装为已经加载的3D。'],
  ['appointment', '/appointment', '预约参观', '保留完整14天日期网格、时段、联系人及人数、预约摘要和场馆信息。日期选中/已满/未开放可区分；桌面主表单与侧摘要，手机单列与底部填写入口。预约流程明确，收紧重复标题和装饰，保持44px操作目标与现有草稿/登录续填提示。'],
  ['shop', '/shop', '河洛文创', '真实商品与价格优先，压缩宣传区高度，产品分类与商品列表容易扫描；商品图避免过度裁切，价格、库存、加入购物车明确。桌面购物车侧栏，手机购物车底部抽屉，展示已有模拟支付语义，不新增真实支付、促销或虚假库存。'],
  ['login', '/login', '账户登录', '紧凑可靠的登录/注册任务界面，邮箱或用户名、密码、验证提示和提交层级清楚。文化图片只作为环境陪衬，避免巨大营销文案；主题与全站一致，手机键盘出现后表单仍可操作，保留找回密码与返回入口。'],
  ['reset', '/reset-password', '重置密码', '与登录页共享视觉语言，突出当前重置步骤、邮箱/验证码/新密码等实际出现的字段及返回登录操作。错误与成功提示紧邻相关字段；不可增加截图与代码未提供的短信或第三方服务。'],
  ['profile', '/profile', '个人中心', '以个人资料、预约记录与订单记录为信息骨架，桌面清楚分区，手机顺序紧凑。状态、时间、编号与可执行动作清楚，空记录保留真实空状态和入口；不要新增积分、会员级别、头像上传或不存在的权益。'],
  ['admin', '/admin', '内容管理', '紧凑内容管理工作台，保留真实栏目、搜索筛选、新建/编辑区与记录列表。工具栏统一高度，表格对齐、状态与发布操作清楚；手机变成记录列表与独立编辑区域。避免大幅文化背景、欢迎大标题和装饰指标，不捏造管理统计。'],
  ['operations', '/admin/operations', '运营管理', '紧凑运营工作台，实际统计、预约/商品/订单等切换保持明确，筛选和列表形成稳定工作区；状态和操作不依赖颜色独自表达，危险动作与常规动作有层级。手机标签可滚动、记录可读，保留真实空状态，不生成假订单或销售数字。'],
  ['not-found', '/image2-missing-page', '页面不存在', '明确页面未找到，返回首页和探索馆藏为可用出口；短标题、简洁说明与充分留白形成轻量恢复页。保持全站导航和主题，不添加错误堆栈、搜索功能或纯装饰3D插图。'],
]
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const manifest = process.argv.includes('--resume') ? JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')).pages : []
try {
  for (const [id, path, title, direction] of pages) {
    if (manifest.some(page => page.id === id)) continue
    const captures = []
    for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
      await context.addInitScript(({ theme, token }) => {
        localStorage.setItem('heluo.theme', theme)
        localStorage.setItem('heluo.locale', 'zh-CN')
        if (location.pathname.startsWith('/admin') || location.pathname === '/profile') localStorage.setItem('heluo.access-token', token)
      }, { theme, token: admin.accessToken })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${env.baseURL}${path}`, { waitUntil: 'domcontentloaded' })
      await page.locator('h1').first().waitFor({ state: 'attached' })
      if (id === 'exhibit') await page.locator('.immersive-exhibit').waitFor({ state: 'visible' })
      await page.waitForTimeout(700)
      await page.evaluate(async () => {
        for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight * .8) {
          scrollTo(0, top)
          await new Promise(r => setTimeout(r, 90))
        }
        await Promise.race([Promise.all([...document.images].map(img => img.decode().catch(() => {}))), new Promise(r => setTimeout(r, 5000))])
        scrollTo(0, 0)
      })
      await page.waitForTimeout(250)
      const info = await page.evaluate(() => ({
        headings: [...document.querySelectorAll('h1,h2,h3')].map(el => el.textContent.trim()),
        controls: [...document.querySelectorAll('button,input,select')].map(el => el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent.trim()).filter(Boolean).slice(0, 50),
        overflow: document.documentElement.scrollWidth - innerWidth,
        brokenImages: [...document.images].filter(img => img.complete && !img.naturalWidth).map(img => img.getAttribute('src')),
      }))
      const screenshot = `inputs-native/${id}-${width}-${theme}.png`
      const continuation = `inputs-native/${id}-${width}-${theme}-continuation.png`
      await page.screenshot({ path: resolve(output, screenshot) })
      await page.evaluate(() => scrollTo(0, Math.min(innerHeight * .85, document.documentElement.scrollHeight - innerHeight)))
      await page.waitForTimeout(180)
      await page.screenshot({ path: resolve(output, continuation) })
      captures.push({ width, theme, screenshot, continuation, deviceScaleFactor: 2, ...info, errors })
      await context.close()
    }
    const prompt = `请基于四张当前网页截图，为「河洛数字博物馆 · ${title}」生成一张高质量、可用 Vue 3 与 CSS 实现的前端升级效果图。\n\n输入顺序：桌面浅色、桌面深色、手机浅色、手机深色。输入均为当前真实代码运行页面，账户及后台使用隔离测试数据。真实文字、图片、文物形态、路由与业务功能是事实约束。\n\n本页专属优化目标：${direction}\n\n实际标题：${captures[0].headings.join('；')}\n实际控件：${captures[0].controls.join('；')}\n\n统一设计：日间月白展厅与夜间深墨展厅成对，青玉主操作、少量古铜和朱砂状态色，真实文物保持原色，背景避免米黄、单一浓绿或装饰渐变。系统宋体只用于策展标题，微软雅黑用于任务标题、表单与数据；字间距为0，桌面任务标题36px，手机28px，正文16px。1200px内容版心、4px间距体系、卡片最多8px圆角；细线、留白、文物与展签建立品牌识别。\n\n用Apple式清晰层级、熟悉控件与可预测反馈改善使用；毛玻璃仅用于必要导航浮层，正文与表单有清楚对比度。实色主按钮、44px可触达控件、稳定表格和输入；禁止卡片套卡片、发光圆球、巨大营销标题、虚构统计及无意义装饰。\n\n交付构图：一张精致设计评审板，完整展现本页改后桌面浅色和桌面深色主布局，旁边配手机浅深布局；四个视图留出足够宽度、文字清楚、不重叠。以实际页面内容为主，必要时延长画布展示首屏以下关键区域。不要浏览器边框、设备外壳、透视倾斜、水印或说明性大标题。不得改变文物和产品，不增加不存在的功能。生成的是优化后的可交互网页视觉参考，不是海报。`
    const promptPath = resolve(docs, `${id}.md`)
    await writeFile(promptPath, `# ${title}优化效果图提示词\n\n路由：\`${path}\`\n\n${prompt}\n`, 'utf8')
    manifest.push({ id, path, title, direction, prompt, promptPath, captures, output: `outputs/${id}.png`, status: 'captured' })
    await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ capturedAt: new Date().toISOString(), baseURL: env.baseURL, pages: manifest }, null, 2))
    console.log(`${id}: captured ${captures.length} states; errors=${captures.flatMap(c => c.errors).length}`)
  }
} finally { await browser.close() }
await writeFile(resolve(docs, 'README.md'), '# 全站实页效果图对应表\n\n每页输入为本轮真实运行的桌面/手机双主题截图；本地隔离测试数据不代表线上记录。生成结果与实现状态见 artifacts/sitewide-image2-upgrade/manifest.json。\n\n| 页面 | 路由 | 专属提示词 |\n| --- | --- | --- |\n' + manifest.map(p => `| ${p.title} | ${p.path} | [${p.id}](${p.id}.md) |`).join('\n') + '\n')
