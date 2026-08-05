# 河洛数字博物馆企业级动画交互设计方案

- 日期：2026-08-04
- 状态：Phase 1-6 已完成；Phase 7 实现与生产浏览器回归完成，新版本实体设备复测待补
- 关联需求：F-01、F-02、F-03、F-05、F-06、F-08、F-09、F-10、F-12、F-13、N-03、N-04、N-06
- 设计基线：`design.md` 的“河洛纸墨”、现有 `motion-v`、`motionFrame` 与 `pointerMotion` 系统
- GSAP skill 来源：`greensock/gsap-skills`，已部署到用户级 `C:\Users\Jie\.codex\skills`；前端已安装 `gsap@3.15.0`

## 1. 方案结论

本项目采用“**安静的编辑式叙事 + 明确的任务反馈 + 单一空间舞台**”的运动语言：

1. 页面进入和滚动揭示帮助访客建立阅读顺序，不用连续装饰动画制造噪声。
2. 按压、加载、成功、失败和禁用状态必须即时可感知，动画不能替代文字、颜色或 ARIA 状态。
3. 3D 展项是全站唯一的空间级主舞台。Three.js 相机、点云、资源释放继续由现有 RAF 管理，GSAP 只编排外层 DOM 面板和导览结构。
4. `motion-v`、CSS、现有 `motionFrame` 和 GSAP 各自拥有明确范围。同一 DOM 节点的同一属性只能有一个动画所有者。
5. 所有动效都可中断、可降级、可回退。移动端、键盘、触摸、减少动态、高对比度和低性能设备优先保持可用性。

## 2. 当前基线与动画所有权

### 2.1 已有实现

| 能力 | 当前实现 | 方案处理 |
|---|---|---|
| 路由进出 | `frontend/src/App.vue` 的 `motion-v` `AnimatePresence`，约 220ms | 保留。GSAP 不作用于 `.route-frame`，避免双重进出动画 |
| 页面/控件微反馈 | `motion-v`、`FluidButton`、`BottomSheet` 与 CSS transition | 保留。GSAP 只接管明确标记的入场/叙事节点 |
| 全局指针和局部探照 | `motionFrame.ts`、`pointerMotion.ts`、`v-pointer-surface` | 保留。GSAP 不创建第二个常驻指针 RAF |
| Three.js 相机、点云和释放 | `ThreeExhibitViewer.vue` 自研 `requestAnimationFrame` | 保留。GSAP 不驱动 WebGL 场景核心循环 |
| 内容详情当前首屏 | `motion-v` article 淡入上移 | 保留 article 根节点；GSAP 只作用于其子层 |
| 商城卡片和购物袋 | `motion-v` stagger、BottomSheet | 保留，避免同一列表被重复编排 |

### 2.2 动画所有权规则

```text
App.vue 路由壳层              -> motion-v
FluidButton / BottomSheet     -> motion-v + CSS
普通按钮、输入框、状态颜色     -> CSS / 现有组件
页面级一次性时间轴             -> GSAP timeline
阅读内容滚动揭示               -> GSAP ScrollTrigger
全局指针和卡片探照             -> motionFrame / pointerMotion
Three.js 相机、点云、RAF        -> ThreeExhibitViewer 自有循环
```

出现以下任一情况时，不新增 GSAP：已有组件已经正确表达状态；动画会改变布局尺寸；动画需要每帧读取 DOM；动画会与拖拽、表单输入或 WebGL 控制竞争。

## 3. 运动语言

### 3.1 五级动效层

| 层级 | 名称 | 目的 | 时长与范围 | 典型位置 |
|---|---|---|---|---|
| M0 | 静态内容层 | 确保无动效仍能完成任务 | 无连续运动 | 后台、正文、失败和空状态 |
| M1 | 状态反馈层 | 告知按下、加载、成功、错误、禁用 | 80–180ms；最多 1px/0.98 scale | `FluidButton`、表单、数量步进 |
| M2 | 组件转场层 | 组织卡片、Sheet、面板出现与退出 | 180–360ms；opacity + transform | 列表首屏、面板、购物袋 |
| M3 | 编辑叙事层 | 建立标题、事实、正文、关联展项的阅读节奏 | 360–900ms；只播放一次或由滚动控制 | 首页、展厅列表、内容详情 |
| M4 | 空间探索层 | 表达文物的实体/点云/视角状态 | 由 Three.js RAF 管理；必须可中断 | 青铜鼎 3D 展项 |

M3 不追求“每个元素都动”，一个视口只允许一个主节奏：标题组、卡片组或正文组择一成为视觉主语。M4 不与 M3 争夺同一画布。

### 3.2 统一令牌

新增令牌应放入 `frontend/src/assets/main.css`，不在页面局部写新色值：

```css
:root {
  --motion-page-duration: 320ms;
  --motion-section-duration: 520ms;
  --motion-item-duration: 420ms;
  --motion-feedback-duration: 120ms;
  --motion-scroll-scrub: .45;
  --motion-stagger-tight: 56ms;
  --motion-stagger-loose: 96ms;
  --motion-distance-short: 8px;
  --motion-distance-medium: 16px;
  --motion-distance-long: 28px;
  --ease-editorial: cubic-bezier(.16, 1, .3, 1);
  --ease-settle: cubic-bezier(.22, 1, .36, 1);
}
```

- 进入：`power3.out` 或 `--ease-editorial`，不使用 bounce、elastic 和夸张 back。
- 退出：`power2.in`，时长为进入的 70%–85%。
- 滚动绑定：`ease: "none"`，由滚动决定进度。
- 颜色/透明度反馈可用 CSS transition；不要用 GSAP 改写布局和主题令牌。
- 页面首次进入只使用 `opacity`、`x/y`、必要时 `clipPath`；禁止从 `scale(0)`、大旋转或屏外飞入。

## 4. 状态与中断模型

### 4.1 页面状态

所有公开页面统一使用以下状态语义，动效只负责状态之间的视觉过渡：

```text
idle -> loading -> ready
                 -> empty
                 -> error -> retry -> loading
ready -> submitting -> success
                    -> error
ready -> disabled / unavailable
```

- `loading`：骨架或明确的状态文字先渲染；不对尚未存在的 API 列表创建 tween。
- `ready`：数据、图片和字体布局稳定后再创建一次性时间轴。
- `error/empty`：使用稳定的静态状态面板，可有一次 180ms 淡入；不循环闪烁。
- `submitting`：按钮进入现有 loading 状态，禁止重复提交；不移动表单字段。
- `success`：保留现有 `InlineStatus` `role="status"`，可增加一次短淡入和图标描边，不自动跳页。

### 4.2 中断优先级

```text
用户输入/拖拽 > 路由离开 > 新数据加载 > 当前动画完成
```

实现要求：

- 同一组件再次进入时先 `kill` 旧 timeline，再从当前视觉值或目标值重建。
- 路由离开时由 `ctx.revert()`/现有组件 cleanup 立即释放，不等待 `onComplete`。
- `document.hidden`、元素离屏、低性能降档时暂停或销毁非必要动画；回到前台不补播旧进度。
- 预设视角、点云切换、拖拽和 GSAP 外层面板互不修改同一 Three.js 相机对象。

## 5. GSAP 在 Vue 中的企业级接入规范

### 5.1 依赖和初始化

真正进入编码阶段时才安装依赖：

```powershell
cd C:\Users\Jie\Documents\博物馆\frontend
corepack pnpm add gsap
```

只在使用滚动叙事的模块注册插件：

```ts
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)
```

不把全部 GSAP 插件注册到全局；Flip、ScrollSmoother、SplitText、DrawSVG 等插件不是本方案第一阶段依赖。

### 5.2 Vue 生命周期与作用域

每个页面只拥有一个根 ref 和一个清理句柄：

```ts
const root = ref<HTMLElement | null>(null)
let ctx: gsap.Context | undefined

onMounted(async () => {
  await nextTick()
  if (!root.value) return
  ctx = gsap.context(() => {
    gsap.from('[data-motion="item"]', {
      autoAlpha: 0,
      y: 16,
      duration: 0.42,
      stagger: { each: 0.056, from: 'start' },
      ease: 'power3.out',
    })
  }, root.value)
})

onBeforeUnmount(() => ctx?.revert())
```

规则：

- 选择器必须限定在页面根节点，优先使用 `data-motion` 而不是跨页面 class。
- 动态 API 数据、图片和字体导致布局变化后，才调用一次 `ScrollTrigger.refresh()`。
- `gsap.matchMedia()` 负责桌面/移动/`prefers-reduced-motion`；其回调内部不再嵌套 `gsap.context()`，退出时统一 `mm.revert()`。
- 所有同一组动作使用 `gsap.timeline()`，不通过大量 `delay` 拼接时间线。
- 只动画 transform、autoAlpha、CSS 自定义属性和 SVG 描边；禁止用 GSAP 改 `width/height/top/left/margin/padding`。

### 5.3 DOM 标记协议

页面模板使用稳定的语义标记：

```html
<main ref="root" data-motion-page="exhibits">
  <header data-motion="intro">...</header>
  <a v-for="item in items" :key="item.slug" data-motion="item">...</a>
  <section data-motion="reveal">...</section>
</main>
```

约定值：`page`、`intro`、`item`、`facts`、`paragraph`、`related`、`cta`、`status`、`native`。这些标记只描述动画意图，不暴露业务字段。

## 6. 页面级设计蓝图

### 6.1 全局壳层和路由

文件：`frontend/src/App.vue`。

- 保留现有 `AnimatePresence` 路由淡入上移和 `MotionConfig reduced-motion="user"`。
- GSAP 不作用于 `.route-frame`、`#main-content` 或移动底部导航，防止焦点、滚动恢复和路由退出冲突。
- 路由进入后先由 App 完成 220ms 过渡，再由页面内部启动自己的 M2/M3 动效；两者不同时抢首帧。
- 页面根节点必须在 `onMounted + nextTick` 后创建动画，避免 Skeleton 还未替换就测量布局。

### 6.2 首页：策展路线首屏时间轴

文件：`frontend/src/views/HomeView.vue`。

**叙事目标**：访客先看到“从一件器物开始”，再理解三条参观路线，最后发现策展卡和 CTA。青铜鼎是唯一主视觉，河流 SVG 只作静态版式线索。

**时间轴**（总时长约 1.05s，首次进入播放一次）：

| 时间 | 元素 | 动作 |
|---:|---|---|
| 0–260ms | `.corridor-home__eyebrow` | `autoAlpha: 0, y: 8 -> 0` |
| 90–470ms | `.corridor-home__title-block h1` | `autoAlpha + y: 16`，标题先于正文 |
| 300–620ms | `.corridor-home__intro` | `autoAlpha + y: 8` |
| 440–860ms | `.corridor-home__routes a` | `stagger: 56ms`，从左到右揭示 |
| 620–900ms | `.corridor-home__location` | `autoAlpha + x: 8` |
| 760–1050ms | `.corridor-home__curation` | 保持现有 `motion-v while-in-view`，不在同一节点再建 GSAP tween |

**交互反馈**：路线链接只使用现有 hover 下划线和 `FluidButton` 按压；不让标题、河流、整页产生跟随鼠标的漂浮。

**移动端**：只播放标题组和路线组的淡入，位移减半；策展卡由现有 `while-in-view` 负责，关闭额外 stagger。

### 6.3 探索馆藏和数字展厅列表：资料索引入场

文件：`frontend/src/views/ExploreView.vue`、`frontend/src/views/ExhibitsView.vue`。

**数字展厅列表是 GSAP 第一实施点**，因为当前列表没有 `motion-v` 列表布局动画，风险最低。

- API 成功且 `items.length > 0` 后，对 `[data-motion="item"]` 执行 `autoAlpha + y: 16`，`each: 56ms`，最多 12 个可见卡片；长列表只动画首屏可见元素。
- 筛选、搜索、分页仍由现有数据渲染和 `motion-v layout` 负责；若未来要为 Explore 加 GSAP，必须先移除同一列表的 `motion-v layout`，不能两者并存。
- `loading`、`empty`、`error` 面板只做一次淡入，不做卡片占位到真实卡片的跨布局飞行。
- `v-pointer-surface` 的倾斜、探照和 GSAP 的首屏位移不得同时写同一个 `transform`；入场完成后清理 GSAP 的 `y`，把 transform 所有权交还给指针指令。

### 6.4 内容详情：滚动叙事

文件：`frontend/src/views/ContentDetailView.vue`。

**叙事顺序**：标题与封面 → 文物事实 → 正文段落 → 关联展项 → 预约 CTA。

| 区块 | 触发 | 动画 | 约束 |
|---|---|---|---|
| `.detail-header` | 页面 ready，非滚动 | 320ms 淡入 + `y: 12` | article 根仍由 motion-v 负责 |
| `.object-facts > div` | 首次进入视口 | 420ms stagger 56ms | 不改变 `dl` 高度 |
| `.detail-content > p` | `top 86%` 进入 | `ScrollTrigger.batch`，淡入 + `y: 14` | `once: true`；移动端不 pin |
| `.related-exhibit` | `top 88%` 进入 | 360ms stagger 72ms | 图片和文字一起出现 |
| `.detail-cta` | `top 90%` 进入 | 420ms 淡入 | 不自动滚动、不自动跳转 |

滚动进度条 `.reading-progress` 保留当前 CSS 变量实现；不要把阅读百分比交给 GSAP，避免两个滚动监听源。内容和图片完成后调用一次 `ScrollTrigger.refresh()`。

### 6.5 3D 展项详情：DOM 编排与空间引擎分离

文件：`frontend/src/views/ExhibitDetailView.vue`、`frontend/src/components/ThreeExhibitViewer.vue`。

**GSAP 可负责**：

- 桌面信息面板、事实列表、实体/点云分段控件和导览 Dock 的一次性进入编排。
- 加载成功后面板从 `y: 12` 淡入；Dock 从 `y: 20` 淡入，间隔 80ms。
- `mobileInfoOpen` 的 BottomSheet 继续由现有组件控制，不由 GSAP 接管拖拽、snap point、焦点陷阱或 ESC。

**必须保留自研实现**：

- `ThreeExhibitViewer.vue` 的相机预设、OrbitControls、点云解构 2.4s 状态机、DPR/质量分档、可中断相机过渡和资源释放。
- GSAP 不直接写 camera、controls、shader uniform 或 Three.js RAF。
- `controls.start`、视角切换、点云解构开始时，暂停外层非必要编排；用户拖拽优先级高于所有动画。

**状态反馈**：实体/点云切换使用现有双向分段控件和 `aria-pressed`；切换文本、`aria-live` 质量状态和封面降级是唯一事实来源，不能只用颜色或粒子变化表达。

### 6.6 预约：任务可靠性优先

文件：`frontend/src/views/AppointmentView.vue`。

- 保留现有 `motion-v` 的页头、时段列表布局和 BottomSheet。
- 日期、时段、人数、联系人字段只使用边框、焦点、错误和成功状态反馈；不抖动整个表单，不倾斜输入框。
- 提交成功可让 `InlineStatus` 以 180ms 淡入，保持用户在当前上下文；不要通过动画掩盖预约状态变化。
- 地图路线 SVG 为说明性内容，默认静态；后续若要绘制路径，必须在 `prefers-reduced-motion: no-preference` 下且不阻塞表单。

### 6.7 商城：选择、购物袋和模拟支付

文件：`frontend/src/views/ShopView.vue`。

- 保留商品卡已有 `motion-v` 入场、购物袋数量 pop 和 BottomSheet。
- 加购只做按钮 loading/成功状态和数量文本的短反馈；禁止商品卡飞入购物袋，避免库存/价格状态与视觉位置脱节。
- 购物袋打开、数量增减、删除和支付成功沿用现有 Sheet/状态播报；动画完成前按钮不能被重复提交。
- 模拟支付成功使用一次状态淡入和订单编号出现，不播放金币、爆炸或全屏庆祝动画。

### 6.8 登录、个人中心和后台

文件：`frontend/src/views/LoginView.vue`、`ProfileView.vue`、`AdminContentView.vue`、`AdminOperationsView.vue`。

- 登录/个人中心保留当前 180ms `motion-v` 淡入；输入错误通过错误文案、焦点回焦和边框语义表达，不使用摇晃。
- 后台默认 M0/M1：列表加载、保存、发布、撤回、删除、恢复等用现有 `AdminActionButton`、`InlineStatus` 和 CSS transition。
- 后台不使用 ScrollTrigger、卡片倾斜、追光、自动轮播或 GSAP 全局时间轴，确保高密度任务稳定和可审计。

## 7. 交互状态细则

### 7.1 通用控件

| 状态 | 视觉反馈 | 动画上限 | 语义要求 |
|---|---|---:|---|
| hover | 边框/底色层级变化 | 160–240ms | 不改变布局 |
| focus-visible | 青玉/朱砂焦点环 | 0–120ms | 必须可见且不依赖自定义光标 |
| pressed | 现有 `scale(.98)` 或 `y: 1px` | ≤120ms | 键盘 Space/Enter 同样反馈 |
| loading | spinner/文案/`aria-busy` | 连续但低成本 | 禁止重复提交 |
| success | `InlineStatus` 淡入 | ≤180ms | `role="status"` |
| error | 错误文案、焦点、边框 | ≤180ms | `role="alert"` 或字段关联 |
| disabled | 降低对比度和禁用 pointer | 无连续动画 | 保留原因说明 |

### 7.2 进入和离开

- 页面进入：由 App 路由 M2 + 页面 M3 组成，两层总时长不得超过 1.2s。
- 页面离开：不延迟路由，不等待图片或 GSAP `onComplete`。
- 快速重复点击：旧 timeline `kill()`，新状态从当前值接续；不能出现两个成功提示或双重播报。
- 浏览器后退：尊重 Router `savedPosition`；滚动叙事重新计算触发点，但不自动滚回顶部。

## 8. 响应式、辅助功能和降级

| 环境 | 动效档位 | 允许内容 |
|---|---|---|
| `min-width: 1024px` + fine/hover | full | M1–M3；3D M4 按现有性能策略 |
| `768–1023px` | restrained | M1–M2；M3 只保留淡入和短位移；不 pin |
| `<768px` 或 coarse/touch | static/restrained | M1；必要的淡入不超过 180ms；BottomSheet 保持原生手势 |
| `prefers-reduced-motion: reduce` | static | 取消位移、scrub、连续粒子回应；保留 ≤150ms 状态变化 |
| `prefers-contrast: more` / forced colors | static | 实色边框、焦点环和文字状态 |
| `prefers-reduced-transparency: reduce` | restrained/static | 玻璃层改实色，不增加光晕 |
| 低帧率 | 自动降档 | 先关闭 L2/L3/L4，再保留任务反馈 |

自定义光标继续遵循 `pointerMotion.ts` 的能力判断。所有 GSAP 组件都必须读取同一 `data-motion-tier` 或共享能力结果，不各自重复判断媒体查询。

## 9. 性能与工程门禁

### 9.1 预算

- 普通页面除 Three.js 外的 GSAP/动画工作目标 `<1ms/frame`；事件处理 `<0.2ms/event`。
- 每个页面最多一个活动 GSAP master timeline；每个滚动叙事区最多 1 个主 ScrollTrigger 和 1 个 batch。
- 不在每帧创建 tween、读取布局或遍历全量卡片；高频跟随继续用 `motionFrame`/`quickTo`。
- 只写 transform、autoAlpha、opacity、CSS 变量和 SVG 描边；不得动画 layout 属性。
- GSAP 依赖增量以生产构建实测为准，目标新增 gzip 不超过 50KB；Three.js chunk 不得因接入 GSAP 增长。
- 页面隐藏、组件卸载和元素离屏后无活动 ScrollTrigger/tween/RAF；3D 资源释放门禁保持现状。

### 9.2 验收设备和状态

固定视口：`320x800`、`390x844`、`768x1024`、`1024x768`、`1433x746`、`1672x941`。

每次实现至少验证：

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Docker 前端重建、HTTP `200`、API health `UP`
- 首页、馆藏、展厅列表、内容详情、3D 展项、预约、商城、登录和后台的桌面/移动控制台无新增错误
- 键盘全流程、`prefers-reduced-motion`、高对比度、减少透明度、200% 缩放、系统大光标
- 3D 实体/点云/加载失败/重试/视角切换/拖拽中断和移动信息 Sheet

性能证据使用 Chrome Performance：普通页与 3D 页各录制 10 秒；CPU 4x 验证降档；页面隐藏 5 秒验证动画和渲染暂停；对比新增脚本体积和长任务。

## 10. 分阶段实施路线

### Phase 0：基线与开关

记录现有构建体积、路由过渡、`motionFrame` 订阅数和 3D 帧率；建立 `data-motion-tier` 与单一功能开关。功能关闭时 DOM、资源请求和业务行为必须不变。

### Phase 1：GSAP 基础封装

已完成：安装 `gsap@3.15.0`，新增 `frontend/src/lib/gsap.ts`，集中导出 scoped `createGsapContext` 和 `shouldRunGsapReveal`；补充静态档/减少动态门禁与 context 生命周期单测。

### Phase 2：展厅列表入场

已完成：`ExhibitsView.vue` 在 API ready、`loading=false` 且 `nextTick` 后对最多 12 张 `[data-motion="item"]` 卡片执行 `autoAlpha + y:16`、`56ms` stagger；空/错状态跳过，`onBeforeUnmount` 通过 GSAP Context 回收。未改变 `v-pointer-surface` 指令或业务状态；对应视图测试覆盖 ready/empty 分支。

### Phase 3：首页时间轴

已完成：`HomeView.vue` 只接管标题块、路线导航和位置标记；保留策展区现有 `motion-v while-in-view`。桌面/受限档分别使用短位移和 stagger，英文标题仍由原布局控制。

### Phase 4：内容详情滚动叙事

已完成：`ContentDetailView.vue` 接入 `ScrollTrigger.batch`，为 facts、正文段落、关联展项和预约 CTA 建立 `once` 揭示；数据 ready 后 `nextTick` 创建并 refresh，阅读进度继续由现有 CSS 变量和 scroll listener 管理。

### Phase 5：3D 外层 DOM 编排

已完成：`ExhibitDetailView.vue` 只为信息面板、工具组和导览 Dock 增加一次性 DOM timeline；`ThreeExhibitViewer.vue` 核心 RAF、相机、点云、拖拽、资源释放和 BottomSheet 均未接管。路由离开通过 Context revert 回收。

### Phase 6：全站回归与运营交付

自动化回归已完成：工程检查、Docker 前端重建、固定视口公共路由、减少动态/高对比度/200% 等效缩放、内容/3D 页面截图和 10 秒性能追踪均通过。用户随后完成 Android/触控笔人工操作复测并确认通过。当前 ADB 未枚举设备，因此该人工复测未新增 CDP 产物；后续改动 GSAP、手势、点云或 Sheet 时必须重新执行实体回归。未通过门禁时，仍按本方案关闭 GSAP 功能入口并回退到现有 `motion-v`/CSS 实现。

### Phase 7：动效叙事层次增强

用户反馈首轮实现以基础淡入和轻位移为主，页面层次感不足。本阶段在不扩大业务范围、不增加无限循环装饰的前提下，增强四条访客叙事路径：

- 首页：标题按行揭示，题签、背景遮罩、路线标题、路线图标和位置标记形成完整首屏编排；总时长仍控制在 1.2 秒内，策展卡继续由 `motion-v` 管理。
- 数字展厅列表：先编排档案编号、标题和交互说明，再让卡片外框、图片、编号、正文和 CTA 分层进入；卡片根节点只做透明度，避免与 `v-pointer-surface` 的 transform 所有权冲突。
- 内容详情：封面、档案编号和标题分层进入；阅读提示、事实、段落、关联展项标题/图片/正文和 CTA 按章节进入视口，不 pin、不 scrub、不接管阅读进度条。
- 3D 展项：场景标签、墙面文字、工具、信息面板内部事实/操作和 Dock 三个分区依次进入；不写入 camera、controls、shader uniform、模型 transform 或 Three.js RAF。

实现门禁：受限档位移不超过 `8px`、时长不超过 `200ms`；`static`/reduced-motion 完全跳过；所有 tween 归属 scoped GSAP Context 并在卸载时 `revert()`；不在同一节点上让 GSAP 与 `motion-v`/`pointerMotion` 同时写 transform/opacity；仅使用 transform、autoAlpha 和一次性 clip reveal，不新增持续 RAF。

验收：类型检查、单元测试、生产构建、`git diff --check`；桌面与 `390x844` 至少覆盖首页、展厅列表、内容详情和 3D 展项，无横向溢出、无控制台错误、无首屏内容长期隐藏；再次确认实体/点云、视角、单指滚动、双指缩放和信息 Sheet 不被外层编排阻断。

实施结果：

- 首页已改为题签、标题逐行、简介、路线面板、路线图标与位置标记的分层时间轴；移动/受限档缩短为 `140-200ms`，策展卡仍由 `motion-v` 管理。
- 展厅列表已增加档案头编排，并对卡片外框、图片、编号、正文和 CTA 分层进入；卡片根不写 transform，避免与 `v-pointer-surface` 冲突。
- 内容详情已增加档案编号、标题、封面 clip reveal、阅读提示、段落、关联展项图文和 CTA 的章节编排；阅读进度条保持原实现。
- 3D 页已增加场景标签、墙面题字、工具按钮、信息面板事实/操作和 Dock 分区编排；Three.js 相机、模型、点云、RAF、手势和 BottomSheet 均未改动。
- 当前验证通过：`corepack pnpm typecheck`、13 个测试文件 44 项、`corepack pnpm build`、Docker 新镜像 `sha256:e1c805ccb24bd7d8040501bf915ec21acf7c2289fa9399341b4c11c106df656d`、HTTP `200`、API health `UP`。GSAP chunk 仍为 `27.70 kB gzip`，Three.js chunk 仍为 `189.46 kB gzip`。
- 生产浏览器 `1433x746` 与 `390x844` 覆盖四页，无横向溢出或控制台错误；3D 实体加载、点云切换和移动信息 Sheet 通过。截图位于本地忽略目录 `artifacts/motion-phase7/`。
- 既有交互门禁复跑通过：`pnpm qa:pointer-pages` 覆盖首页/商城八档共 16 组，`pnpm perf:pointer` 的 14 项 Performance 门禁全部通过；普通页不加载 Three.js、CPU 4x 自动降为 static、后台隐藏 5 秒零帧、touch 使用 static/系统指针、hybrid pen 使用 restrained/系统指针，减少动态、高对比度、200% 缩放和固定视口无关键溢出。
- 尚未执行：Phase 7 新代码的 Android/触控笔实体复测。ADB 已定位但当前无设备枚举；Phase 1-6 的旧版人工结论不能替代本次复测。

### Phase 8：浏览器标注布局校准

根据 `1433x746` 生产页面的 5 条浏览器标注，只调整桌面端空间关系，不改商品数据、购物车、展项数据、GSAP 时间轴或移动端卡片结构：

- 商城介绍板收窄至场景轨道的 `54%`，右缘退出茶壶主体，目标视口下中文标题仍保持两行。
- 河图纹笔记本信息板下移 `28px`，河流纹茶杯套装信息板下移 `14px`，河洛水系丝巾信息板下移 `60px`。
- 数字展厅介绍板改为 `100%` 页面轨道宽度，与下方主展项卡片左右边界对齐；只在 `901px` 以上启用三列比例。

验证结果：`corepack pnpm typecheck`、13 个测试文件 44 项、`corepack pnpm build`和 `corepack pnpm qa:pointer-pages` 全部通过；前端 `200`，16 组首页/商城映射门禁无横向溢出或控件裁切。Docker Hub 授权端点两次超时后，使用本地生产 `dist` 更新运行容器并固化为本地镜像 `sha256:a2a765db432b0e49f2f6dca429611fdc923e2ebe7d0f8b08aaed838ca0d7edcf`。目标截图保存于本地忽略目录 `artifacts/browser-annotations/`。

## 11. 设计验收标准

### 访客体验

- 首次打开首页 1.2s 内完成主要内容显现，标题、路线和 CTA 顺序可理解。
- 展厅列表在 API 成功后按顺序出现，加载、空、错状态不闪烁、不跳布局。
- 内容详情滚动时事实、正文和关联展项依次出现，阅读进度与滚动位置保持一致。
- 3D 页面首屏实体模型稳定可见；点云切换、视角、拖拽、重试和移动 Sheet 不被动画阻断。
- 预约、商城模拟支付、登录和后台操作的成功/失败状态可读、可回焦、可重复验证。

### 技术质量

- 同一节点不存在 `motion-v` 与 GSAP 对同一 transform/opacity 属性的竞争。
- 所有 GSAP Context、ScrollTrigger、监听器和 tween 在卸载后释放。
- `prefers-reduced-motion`、coarse pointer、forced colors 和低帧率下无连续动效。
- 普通页不加载 Three.js；3D 页不新增第二个 RAF。
- 关键路径工程检查、Docker health、浏览器回归和性能 trace 均有可保存证据。

## 12. 评审清单与回滚

### 12.0 当前实施验证

- 依赖：`frontend/package.json` / `frontend/pnpm-lock.yaml` 已锁定 `gsap@3.15.0`。
- 文件：`frontend/src/lib/gsap.ts`、`frontend/src/lib/gsap.spec.ts`、`frontend/src/views/ExhibitsView.vue`、`frontend/src/views/ExhibitsView.spec.ts`、`frontend/src/views/HomeView.vue`、`frontend/src/views/ContentDetailView.vue`、`frontend/src/views/ExhibitDetailView.vue`。
- 已通过：`corepack pnpm typecheck`、`corepack pnpm test`（13 个测试文件、43 项）、`corepack pnpm build`、`git diff --check`。
- 构建体积：独立 GSAP chunk gzip `27.70 kB`，展厅列表 chunk gzip `2.65 kB`，低于新增 GSAP gzip `50 kB` 预算；Three.js chunk 未因接入新增第二个 RAF。
- 自动化证据：Docker 前端镜像 `sha256:9da4b472b0270e7ca17361507edee370dd0ad92fa4771ec33c446b9333f6a50d`；公共路由 `390x844`/`1433x746` 共 18 组均 `200`、无横向溢出、无新增控制台错误；追踪文件为 `artifacts/motion-home-10s-trace.zip`、`artifacts/motion-exhibit-10s-trace.zip`。4x CPU CDP 指标：首页 10 秒 TaskDuration `19ms`，3D 页 `6982ms`（包含 WebGL 主循环）。
- 触控仿真：Chrome `390x844`、`hasTouch`/coarse pointer 自动进入 `static` 档；3D 信息 Sheet 可打开，内容详情可滚动，无横向溢出或控制台错误。
- 实体设备复测：用户已完成人工 Android/触控笔操作复测并确认通过。ADB 已定位为 `C:\Users\Jie\.codex\tools\platform-tools\adb.exe`，但当前 `adb devices -l` 未枚举设备，故本次验收不附加新的 CDP 截图或自动化日志。

### 12.1 运行治理

- 用 `document.documentElement.dataset.motionTier` 作为会话级降档入口；默认由能力判断生成，必要时可在 QA 环境强制 `static`，不新增业务环境变量。
- 开发和预发布环境可使用 `performance.mark('museum-motion:<page>:start/end')` 记录时间轴耗时、首个内容可见时间和 ScrollTrigger refresh 次数；不记录用户输入内容、账号或订单信息。
- CI 需检查 `data-motion` 标记是否仍在组件根节点内、`prefers-reduced-motion` 分支是否存在、卸载后是否释放 Context；生产构建检查新增 gzip 体积和 Three.js chunk 不回退。
- 发布说明记录本次启用的页面、动效档位、设备范围、性能证据、截图/trace 路径和回滚开关；后台始终保持静态档，不受公众端开关影响。

评审者逐项确认：动画是否表达状态或阅读层级；是否有更简单的 CSS/motion-v 方案；是否改变业务时序；是否影响键盘、触摸、200% 缩放和高对比度；是否有 cleanup 和失败降级；是否超过性能预算；是否需要新增 ADR 或资产来源记录。

回滚顺序：

1. 关闭 `data-motion-tier` 的 GSAP 功能开关。
2. 移除对应页面的 GSAP 初始化调用，保留 DOM 标记和现有 `motion-v`/CSS。
3. 若是滚动叙事异常，杀掉该页面 Context 和 ScrollTrigger，不影响阅读进度条。
4. 只有确认需要保留的稳定方案才进入后续提交；本方案本身不执行 Git commit、push 或清理现有用户修改。
