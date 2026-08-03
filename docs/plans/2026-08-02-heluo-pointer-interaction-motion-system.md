# 河洛鼠标交互动效系统方案

- 日期：2026-08-02
- 状态：已完成；工程、Docker、浏览器、Performance trace、Android 二次真机自动化、用户录像与实体设备人工验收均通过
- 关联需求：F-01、F-02、F-03、F-05、F-09、N-03、N-06
- 设计基线：根目录 `design.md` 的“河洛纸墨”
- 参考站：`https://theme.npm.edu.tw/3d/`、`http://chan-cc3721-d0gnfxg7pb8a1370b.webapps.tcloudbase.com/`

## 1. 目标与边界

为桌面精细指针设备建立一套“可感知但不喧宾夺主”的鼠标交互动效，使指针、馆藏图片和 3D 文物形成连续反馈，同时保持预约、商城、认证与后台任务的效率和可预测性。

本方案只改变前端表现层，不改变路由、API、鉴权、预约状态机、订单幂等、资产来源或数据库。实施时复用现有 Vue 3、TypeScript、`motion-v` 和 Three.js，不新增 GSAP、光标库、动效库或第二套常驻 Canvas/WebGL 渲染器。

## 2. 参考站研究结论

| 参考 | 可借鉴的交互 DNA | 河洛项目中的取舍 |
|---|---|---|
| 故宫 3D | 双层光标；外环延迟跟随；可交互元素悬停时点/环发生形态变化；滚动、标题、模型与点阵组成单一主舞台 | 保留双层光标和“一个主舞台”；取消夸张三倍放大、过冲和强制滚动控制模型，不复制常驻点阵背景 |
| Chanly | 仅精细指针启用；按压态；卡片局部光照与轻微倾斜；指针速度驱动局部点阵；离屏、后台和减少动态时暂停 | 保留能力检测、局部探照、轻倾斜和性能暂停；去除霓虹、`screen` 混合、紫青发光、深色玻璃卡和大面积 shader 背景 |

结论：不复刻任一网站的视觉皮肤。河洛版本只抽取“即时反馈、连续追随、局部响应、性能自控”四个行为原则，并使用宣纸、墨绿、朱砂和青铜的现有语义令牌重新表达。

## 3. 设计原则

1. **文物优先**：动效用于确认“这里可探索”和建立文物空间感，不能比青铜鼎、馆藏图片或正文更抢眼。
2. **一个标志性舞台**：空间级响应只出现在 3D 展项；其他页面最多使用局部图片探照和轻倾斜。
3. **即时开始、平滑追随**：内点直接响应当前指针；外环从当前屏幕位置继续追随，不跳回逻辑目标，也不弹跳过冲。
4. **输入让位**：表单输入、文字选择、滚动条、拖拽 Sheet 和 Three.js OrbitControls 使用熟悉的原生指针语义。
5. **键盘独立完整**：自定义光标不承担可访问名称、焦点或状态表达；键盘继续使用朱砂 `focus-visible` 焦点环。
6. **可中断、可降级**：页面切换、标签隐藏、元素离屏、低帧率、减少动态或粗指针出现时立即停用，不等待动画结束。

## 4. 动效层级与页面映射

### L0：原生任务层

适用：预约、登录、重置密码、个人中心表单，商城结算表单，后台全部页面。

- 文本、输入框、下拉框、滚动区域保留系统光标。
- 按钮仍使用现有 `FluidButton` 的按压反馈，不增加卡片倾斜或追光。
- 后台只允许链接/按钮触发外环紧凑变化；危险操作外环切换朱砂，且文字和图标仍完整表达危险含义。
- 目标是“工具消失在任务里”，不把公众端的策展动效带进运营工作台。

### L1：全局河洛双层光标

适用：桌面端公开页面，且同时满足 `(hover: hover)`、`(pointer: fine)`、未开启减少动态/高对比度、页面可见。

- 内点：直径 `6px`，墨绿色实心，位置 1:1 跟随，默认不使用 transition。
- 外环：直径 `30px`，`1px` 青灰描边，使用时间常数 `72ms` 的指数平滑追随；不使用固定 `0.18` 帧插值，避免 60Hz/120Hz 设备手感不同。
- 普通链接/按钮：外环放大到 `38px`，内点缩到 `4px`，`120ms` 内完成颜色/尺寸变化。
- 主操作：外环 `40px`，描边切换为 `--color-action`，不添加 glow。
- 危险操作：外环 `38px`，描边切换为 `--color-danger`；不改变内点颜色，避免整页出现朱砂闪烁。
- 按下：内点缩放 `0.72`，外环缩放 `0.86`，`80ms` 立即反馈；松开从当前值回到对应悬停态。
- 离开视口：`100ms` 淡出；重新进入时先把当前位置同步到目标，再淡入，避免从旧位置穿屏。

### L2：馆藏纸面探照

适用：馆藏卡片、数字展厅列表卡、商城商品图片；同一时刻最多一个激活元素。

- 指针坐标写入元素局部 `--pointer-x`、`--pointer-y`，范围为 `0%` 到 `100%`。
- 图片上方使用半径 `180px` 的极弱径向纸面明暗，中心亮度变化不超过 `4%`，边缘不出现发光轮廓。
- 馆藏/展项卡最大旋转 `±1.15deg`，商品卡最大 `±0.8deg`；悬停上移最多 `1px`。
- 透视为 `1200px`，进入/离开使用 `240ms var(--ease-out)`；指针移动期间直接更新 transform，离开后回到 `rotateX(0) rotateY(0)`。
- 卡片主体不缩放，文字层不单独漂移，避免破坏编辑式版面和整卡焦点覆盖。
- 内容详情长文、关联阅读横卡、预约票据、表单和后台记录卡禁用倾斜。

### L3：3D 文物微视差

适用：`ThreeExhibitViewer` 桌面精细指针模式，仅在模型加载成功、Canvas 可见、用户未操控 OrbitControls 时启用。

- 归一化指针为 `x/y ∈ [-1, 1]`，经过 `0.12` 死区和缓动后，只影响一个相机偏移目标。
- 最大相机偏移：水平 `0.12` 世界单位、垂直 `0.07` 世界单位；目标点偏移不超过 `0.025`。
- 相机视差以时间常数 `120ms` 平滑，不改变 `minDistance`、`maxDistance`、极角/方位角限制或预设视角。
- `OrbitControls start`：立即冻结微视差并以当前相机为交互起点；用户拖拽期间显示原生 `grab/grabbing`，全局自定义光标隐藏。
- `OrbitControls end`：等待 `320ms` 安静期，再以当前位置为基准恢复微视差；绝不把相机拉回旧预设。
- 触发预设视角、重置视角或 2.4 秒点云解构时暂停微视差；相机过渡可被下一次拖拽立即中断。
- 不把页面滚动绑定到文物旋转，不新增自动旋转，不让指针改变点云解构状态机。

### L4：点云局部回应（第二阶段候选）

只复用现有点云 shader，不新建 Canvas、粒子系统或 RAF。

- 仅 `points-idle` 状态响应指针；实体模式、解构过程和回退模式不响应。
- 将 Canvas 局部指针投射到模型附近的交互平面，向现有 shader 增加 `uPointer`、`uPointerStrength`、`uPointerRadius` 三个 uniform。
- 半径内点位最大偏移不超过模型包围盒长边的 `0.7%`，强度由指针速度平滑驱动，静止后 `280ms` 内回落为 0。
- 不改变深墨玉/古铜金配色，不添加 sparkle、发光尾迹或持续波浪。
- 只有 L1-L3 稳定通过性能与可访问性验收后才进入该阶段；若 3D 页帧时间回退，直接取消 L4，不影响其余系统。

## 5. 指针状态机

```text
disabled
  -> idle
idle
  -> link | action | danger | media | native
link/action/danger
  -> pressed
pressed
  -> previous-hover-state
media
  -> controls-active
controls-active
  -> media (320ms quiet period)
any-enabled-state
  -> hidden (leave viewport / page hidden)
  -> disabled (coarse pointer / reduced motion / contrast more / low-performance fallback)
```

状态优先级：`disabled > native > controls-active > pressed > danger > action > link > idle`。嵌套元素只取最高优先级，避免卡片、链接和按钮同时竞争光标形态。

建议用声明式属性标注，不靠复杂选择器猜测：

```html
<a data-cursor="link">...</a>
<button data-cursor="action">...</button>
<button data-cursor="danger">...</button>
<article v-pointer-surface="{ kind: 'collection', maxTilt: 1.15 }">...</article>
<div data-cursor="native">...</div>
```

## 6. 语义令牌

在 `main.css` 的现有令牌旁新增，所有页面只引用语义令牌：

```css
:root {
  --cursor-dot-size: 6px;
  --cursor-ring-size: 30px;
  --cursor-ring-interactive-size: 38px;
  --cursor-ring-action-size: 40px;
  --cursor-ring-width: 1px;
  --cursor-dot-color: var(--color-action-strong);
  --cursor-ring-color: color-mix(in oklch, var(--color-rule-strong) 82%, transparent);
  --cursor-ring-action: var(--color-action);
  --cursor-ring-danger: var(--color-danger);
  --pointer-spotlight-radius: 180px;
  --pointer-spotlight-strength: 4%;
  --pointer-perspective: 1200px;
  --motion-pointer-state: 120ms;
  --motion-pointer-settle: 240ms;
  --ease-pointer: cubic-bezier(.16, 1, .3, 1);
  --z-cursor: 130;
}
```

不使用 `mix-blend-mode: screen`、大面积 `filter: blur()`、霓虹 box-shadow、负向字距或新的颜色常量。高对比度/减少动态模式下令牌不会仅被改色，而是直接停止自定义光标和倾斜。

## 7. Vue 与代码接口设计

### 7.1 目录和职责

| 文件 | 职责 |
|---|---|
| `frontend/src/components/PointerCursor.vue` | 只渲染内点和外环，读取全局指针状态，不监听页面业务 |
| `frontend/src/composables/usePointerCapabilities.ts` | 汇总 fine/coarse、hover、媒体偏好、可见性和性能档位 |
| `frontend/src/composables/usePointerMotion.ts` | 记录目标坐标、状态和订阅者；不直接操作页面卡片 |
| `frontend/src/directives/pointerSurface.ts` | 将局部坐标和轻倾斜写入当前元素；卸载时清理监听和 style |
| `frontend/src/lib/motionFrame.ts` | 唯一全局 RAF 调度器；空订阅时停止 |
| `frontend/src/components/ThreeExhibitViewer.vue` | 接收归一化指针，处理相机微视差与可选 shader uniform |
| `frontend/src/assets/pointer-motion.css` | 光标、探照材质、能力和辅助功能降级规则 |

### 7.2 Composable 契约

```ts
type CursorIntent = 'idle' | 'link' | 'action' | 'danger' | 'media' | 'native'
type MotionTier = 'full' | 'restrained' | 'static'

interface PointerSnapshot {
  clientX: number
  clientY: number
  velocityX: number
  velocityY: number
  visible: boolean
  pressed: boolean
  intent: CursorIntent
  tier: MotionTier
}

interface PointerSurfaceOptions {
  kind: 'collection' | 'exhibit' | 'product'
  maxTilt?: number
  spotlight?: boolean
}
```

`pointermove` 只保存最新目标和带时间戳的短历史，不读取布局、不写 DOM。布局矩形仅在 `pointerenter` 和 `ResizeObserver` 回调中更新；RAF 每帧最多写两个光标 transform 和当前一个 surface 的 CSS 变量。

### 7.3 帧率无关平滑

外环和微视差使用指数平滑：

```ts
const alpha = 1 - Math.exp(-deltaMs / tauMs)
current += (target - current) * alpha
```

这样 `tau=72ms` 在 60Hz、90Hz 和 120Hz 下保持接近一致的物理感觉。路由切换或页面从后台恢复时先同步 `current = target`，不补播中间帧。

### 7.4 Three.js 接口

不创建第二个 RAF。`ThreeExhibitViewer` 现有 `animate(time)` 循环在渲染前读取一个轻量 `pointerParallaxTarget`：

```ts
interface ExhibitPointerInput {
  x: number
  y: number
  velocity: number
  active: boolean
}
```

相机微视差应保存“用户/预设控制后的基准相机位”和“视觉偏移”两个独立向量；OrbitControls 永远修改基准位，指针只叠加视觉偏移。组件卸载时继续执行现有 renderer、材质、geometry、observer 和监听器释放流程。

## 8. 能力分档与降级

| 档位 | 条件 | 行为 |
|---|---|---|
| `full` | fine pointer、hover、页面可见、帧率稳定、无减少动态/高对比度 | L1 + 当前页面允许的 L2/L3；通过性能门槛后可启用 L4 |
| `restrained` | 省流量、低核心数/低内存提示或 20 帧采样平均低于 50fps | 保留内点/外环状态，关闭卡片倾斜、点云回应；3D 微视差幅度减半或关闭 |
| `static` | coarse pointer、无 hover、减少动态、高对比度、键盘主导、持续低于 40fps | 使用系统光标；无倾斜、探照、微视差和点云指针响应 |

- `prefers-reduced-motion: reduce`：静态档；保留原有不超过 `150ms` 的颜色/透明度状态反馈。
- `prefers-contrast: more`：静态档；保留高对比度边框和焦点环。
- `prefers-reduced-transparency: reduce`：可保留 L1 位置反馈，但所有半透明探照材质改为实色边框/背景变化；若浏览器同时报告减少动态则静态档。
- `(pointer: coarse)` 或 `(hover: none)`：不挂载 `PointerCursor`，不注册卡片 `pointermove`。
- `document.hidden` 或元素离屏：暂停对应订阅；回到前台后不补帧。
- 触摸笔若同时支持 hover，默认仍按 restrained 档，不让自定义光标遮挡精细书写/选择。

## 9. 页面级落点

| 页面 | 启用 | 禁用/说明 |
|---|---|---|
| 首页 | L1；青铜鼎主视觉区域可使用一次极弱局部探照 | 不新增常驻点阵 Canvas，不让全部区块随滚动浮动 |
| 馆藏探索 | L1 + 馆藏图片 L2 | 搜索框、分类滚动条和正文保留原生行为；空/错/加载态无倾斜 |
| 内容详情 | L1 链接态 | 阅读正文、阅读进度和关联长文卡不倾斜，避免干扰阅读 |
| 数字展厅列表 | L1 + 展项卡 L2 | 编号栏和文字不单独漂移；移动端全部关闭 |
| 数字展项详情 | Canvas 外 L1；Canvas 内原生 grab；L3；通过门槛后 L4 | 拖拽、预设视角、解构和加载/失败时暂停；不新增自动旋转 |
| 预约 | 只在非表单导航/按钮使用 L1 | 日期、时段、联系人输入、Sheet 拖拽均不使用 L2/L3 |
| 商城 | L1 + 商品图片 L2 | 购物袋、数量步进、结算和支付状态只使用标准控件反馈 |
| 登录/账户 | 链接和按钮 L1 | 输入、密码显示、错误回焦保持原生和现有语义 |
| 后台 | 仅链接/按钮的克制 L1，默认可配置关闭 | 无卡片倾斜、追光、3D 和页面级装饰动效 |

## 10. 性能预算

- 不新增运行时依赖；新增首屏交互代码目标不超过 `12kB` minified、`5kB` gzip。
- 普通页面只允许一个全局 RAF；无可见订阅者时 RAF 为 0。
- `pointermove` 主线程工作目标 `<0.2ms/event`；普通页面 RAF 工作目标 `<1ms/frame`。
- 3D 页在现有渲染基础上的指针增量目标 `<0.5ms/frame`；不得提高当前 DPR 或点云数量。
- 同一帧最多更新两个光标层和一个局部卡片；不遍历所有卡片。
- 光标只动画 `transform` 和 `opacity`；探照使用伪元素背景位置，且仅当前元素获得 `will-change`。
- 3D Canvas 使用现有 DPR 上限和质量分档；补充 `IntersectionObserver` 与 `visibilitychange` 暂停渲染的验证，不能假设已有循环自动暂停。
- 低帧率保护：连续 20 个活跃帧平均 `<50fps` 降为 restrained；第二个窗口仍 `<40fps` 降为 static，本次会话不自动升档，避免来回抖动。
- 构建体积以现有 CSS `679.81kB`、主 JS `1162.27kB`、Three.js `734.33kB` 为基线；本方案不得让 Three.js chunk 因新依赖增长。

## 11. 无障碍要求

- `PointerCursor` 使用 `aria-hidden="true"`、`pointer-events: none`，不进入可访问树和 Tab 顺序。
- 禁止在 `html/body` 全局无条件设置 `cursor: none`；只在能力通过且组件已挂载后给公开壳层加能力类。
- 输入框、可编辑内容、文字选择、滚动条和 3D 控制区必须显示其熟悉的系统光标。
- 自定义光标不表达唯一信息；危险、加载、成功、禁用仍由文字、图形、颜色和 ARIA 状态共同表达。
- 键盘 Tab、Enter、Space、ESC、Sheet 焦点陷阱/回归不因指针系统变化。
- 200% 缩放、Windows 高对比度、系统大光标和浏览器最小字体设置下自动回到系统光标。
- 不使用闪烁、快速明暗跳变、全屏视差或持续低频摆动。

## 12. 测试矩阵

### 单元测试

- 能力判断：fine/coarse、hover、reduced motion/transparency、contrast、hidden。
- 状态优先级：嵌套卡片/链接/危险按钮、按下与松开、离开视口。
- 指数平滑在不同 `deltaMs` 下收敛且不越界。
- 指令卸载后移除监听、observer、CSS 变量和 RAF 订阅。
- Three.js：OrbitControls start 中断视差/预设过渡，end 后以新基准恢复；组件卸载不留 RAF/监听器。

### 浏览器与视觉回归

- 固定尺寸：`320x800`、`375x812`、`390x844`、`414x896`、`768x1024`、`1024x768`、`1440x900`、`1672x941`。
- 指针设备：鼠标 60Hz、120Hz/高刷；触控板；触摸模拟；真实手机；可用时补充触控笔。
- 路由：首页、馆藏、详情、展厅列表、3D、预约、商城、登录、个人中心、后台内容、后台运营。
- 状态：加载、失败封面、空列表、禁用、危险操作、购物袋、Sheet、3D 实体/点云/解构/重试。
- 辅助功能：键盘全流程、减少动态、减少透明度、高对比度、200% 缩放、系统大光标。
- 稳定性：快速穿过多个卡片、按下拖出、窗口失焦/恢复、路由中途切换、3D 拖拽中触发预设、离屏返回。

### 性能证据

- Chrome Performance 分别录制普通馆藏页和 3D 页 10 秒交互；记录 FPS、长任务、事件耗时和新增脚本体积。
- CPU 4x 降速下验证自动降档；页面隐藏 5 秒验证 RAF/渲染暂停。
- 对比实施前后首页资源、普通路由是否请求 Three.js、3D 首帧和模型可交互时间；只接受不回退。

## 13. 分阶段实施顺序

### 阶段 0：基线和开关

1. 记录当前构建体积、普通页/3D 页性能和媒体偏好表现。
2. 建立 `MotionTier` 与单一功能开关，默认关闭新系统。
3. 补齐 RAF 调度器和能力判断单元测试。

验收：功能关闭时 DOM、样式、资源请求和现有行为无变化。

### 阶段 1：全局双层光标

1. 实现 `PointerCursor`、状态机和声明式 `data-cursor`。
2. 只接入首页、馆藏、展厅列表和商城公开壳层。
3. 验证表单、文字选择、键盘、粗指针和媒体偏好降级。

验收：无指针穿屏、无点击拦截、无焦点回归；普通页性能预算通过。

### 阶段 2：局部纸面探照

1. 实现 `v-pointer-surface`，先接入馆藏卡。
2. 通过视觉验收后扩展到展项卡和商品图片。
3. 后台、详情长文和任务表单保持禁用。

验收：最大倾斜和亮度严格受限；卡片文字、整卡链接和布局无位移回归。

### 阶段 3：3D 微视差

1. 将指针输入接入现有 Three.js RAF。
2. 分离相机基准位与视觉偏移，处理 OrbitControls/预设视角/解构互斥。
3. 完成资源释放、离屏暂停和低性能降档验证。

验收：拖拽始终优先且可中断；相机无跳变；现有点云状态机和画质档位不变。

### 阶段 4：点云局部回应（可取消）

1. 仅在前三阶段全部通过后增加 shader uniform。
2. 对比增量帧耗时和视觉收益。
3. 任一移动/低性能验收回退即删除 L4，保留 L1-L3。

验收：增量 `<0.5ms/frame`，无颜色/轮廓回归，无第二个 RAF。

### 阶段 5：全量验收与文档

运行 `pnpm typecheck`、`pnpm test`、`pnpm build`、Docker 实际部署、HTTP/API health、三角色浏览器流程和真实设备记录；更新 `PROJECT_STATUS.md` 与需求追踪表，审查当前任务 diff，等待用户确认后再暂存或提交。

## 14. 影响文件与风险

预计新增/修改只限于前端共享交互、对应公开页面、3D 组件、测试和文档。实现前需要先收口当前未完成的前端细节优化 diff，避免在 `ThreeExhibitViewer.vue`、`main.css` 和 `interaction.css` 上交叉覆盖。

主要风险：

- 自定义光标覆盖原生语义，导致输入、选择或 3D 拖拽不明确；通过 `native` 状态和能力类控制。
- 多个 pointer listener/RAF 叠加引发掉帧；通过全局调度器、单激活 surface 和 3D 复用现有循环控制。
- 倾斜破坏东方编辑版式；通过页面白名单和 `±1.15deg` 上限控制。
- 点云指针回应与 2.4 秒解构竞争；通过状态机只允许 `points-idle` 响应。
- 浏览器对 `prefers-reduced-transparency` 支持不一致；以 CSS 媒体查询加能力检测，未支持时仍由减少动态/高对比度和用户设备类型兜底。

## 15. 最终验收标准

- 交互明显属于“河洛纸墨”，没有霓虹、紫青发光、玻璃卡或参考站皮肤复制。
- 3D 展项是唯一空间级主舞台；其他页面动效安静、局部且服务内容理解。
- 鼠标、触控板、键盘、触摸、减少动态、减少透明度和高对比度均能完成核心任务。
- OrbitControls、预设视角和点云解构相互可中断、无跳变、无控制权争抢。
- 无新增依赖、第二套渲染器、普通路由 Three.js 预加载或构建体积无依据膨胀。
- 普通页与 3D 页性能均不低于实施前基线；降档与资源释放有自动化和浏览器证据。
- 本方案已完成工程、Docker、桌面浏览器、二次 Android 自动化和实体设备人工验收；N-03 验收完成。

## 16. 实施与验证结果

### 16.1 已实施范围

- 新增双层指针、能力分档、共享按需 RAF、声明式 `data-cursor` 与 `v-pointer-surface`；后台、表单、购物袋和 3D Canvas 保持原生指针语义。
- 首页严格只使用 L1；馆藏、数字展厅列表和商城商品图片使用 L2。商城桌面对象工作室背景只保留局部纸面探照，空间倾斜和抬升均关闭；同一时刻只允许一个 surface 激活。
- 3D 展项在既有渲染循环内接入死区微视差、OrbitControls 抢占、320ms 恢复、离屏/后台暂停和点云局部回应；未新增 Canvas、RAF 或运行时依赖。
- 键盘 `Tab` 立即将应用级动效档切为 `static`，压平已激活 surface，并让 3D 相机/点云停止指针响应；鼠标再次移动后从当前位置恢复。
- 修复键盘档恢复时监听器晚于 `pointerenter` 挂载导致 surface 不激活的问题；首次进入指令的 `pointermove` 现在会幂等接管 active surface，并继续保证同一时刻最多一个激活元素。
- 光标位置、形态和可见性的 DOM 写入全部收口到共享 RAF；`pointermove`、键盘转鼠标和状态切换只更新目标值并请求下一帧，避免事件回调与 RAF 竞争写入 `transform`。
- `resolveCursorIntent()` 按祖先链统一解析 `native > media > danger > action > link > idle`，再叠加 disabled/pressed 等瞬时状态；嵌套危险操作与普通 action 不再相互覆盖。
- surface 普通离开时保留受控回正；快速切换到新元素时立即清理旧元素的样式和 RAF 订阅，DOM 任一时刻只保留一个 active surface，帧调度器也只保留一个局部 surface 订阅。
- 修复混合输入设备切换：触控笔事件立即移除 `cursor: none` 和自定义光标并进入 `restrained`，触摸进入 `static`，真实鼠标再次移动后恢复能力档；`data-cursor="native|media"` 的全部后代也明确恢复系统光标。
- 3D 每帧合并初始化能力档与应用实时档并始终采用更保守者；低 FPS 降为 `restrained` 时相机幅度同步减半且关闭点云回应，`static` 时全部停止。
- 修复 3D 在后台标签首次挂载时把瞬时 `hidden` 固化为永久 `static` 的问题；后台可暂停，恢复后重新使用实时应用档位。进入 `static` 后相机视觉偏移在当前帧立即归零，不再补播 120ms 回正动效。
- 3D 容器输出只读 `data-render-state="running|paused-hidden|paused-offscreen"`，用于自动化验证渲染循环状态，不改变视觉、交互或可访问树。
- 商城桌面对象工作室使用独立背景探照层且 `maxTilt=0`、`lift=0`；商品文字与按钮保持静止，购物袋输入继续显示系统文本光标。平板和移动端显示的商品图片继续受原有 L2 上限约束，但粗指针能力档会直接停用。

### 16.2 自动化与构建

| 检查 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test` | 9 个测试文件、35 项测试通过；覆盖 RAF 前不写 transform、action/pressed/disabled 状态、混合设备 pen/touch/mouse 切换、嵌套 danger/action 优先级、单 active surface、能力降档、Three.js 隐藏恢复、移动点云 palette、后台标签键盘语义与商城唯一状态播报 |
| `pnpm build` | 通过；保留既有 VueUse 注释和大 chunk 警告 |
| `pnpm perf:pointer-size` | 通过；指针交互 JS `10,443 B / 3,765 B gzip`，低于 `12,000/5,000 B` 预算；CSS 单独为 `4,760 B / 1,237 B gzip`，且 `noLayoutPropertyTransitions=true` |
| `pnpm qa:pointer-pages` | 通过；首页/商城八档 16 组截图与 DOM 门禁均通过 |
| Docker | 前端镜像 `sha256:fd207a6a605e0874a9876c11e19a02d220bf0354a0c174545dad90ff7c0066dd`；`deploy-frontend-1`、`deploy-backend-1` 运行，MySQL `healthy` |
| HTTP | `http://localhost:8088/` 返回 200；`/api/v1/health` 返回 `UP` |

2026-08-03 当前镜像复跑：`pnpm perf:pointer` 14 项门禁全部通过，普通馆藏页 CPU 1x 指针派发平均 `0.097ms`、RAF 平均 `0.069ms`，3D 点云实际激活；CPU 4x 下普通页自动降为 `static`。`pnpm qa:pointer-pages` 的首页/商城八档 16 组回归全部通过：无横向溢出、无控件截断、首页仅 L1、商城探照激活且无空间位移。

构建体积以本轮实施前实测值为基线：CSS `681.63 kB / 152.74 kB gzip`，主 JS `1162.59 kB / 385.29 kB gzip`，Three.js `734.33 kB / 189.46 kB gzip`。最终为：

| 产物 | 最终 | 变化 | 结论 |
|---|---:|---:|---|
| CSS | `221.12 kB / 59.94 kB gzip` | 当前生产构建 | transform-only 光标状态与混合输入规则仍显著低于基线 |
| 主 JS | `269.60 kB / 96.79 kB gzip` | 当前生产构建 | 路由分包保持生效 |
| Three.js | `734.33 kB / 189.46 kB gzip` | `0` | 未因本轮增加依赖或膨胀 |

### 16.3 浏览器证据

- `320x800`、`375x812`、`390x844`、`414x896`、`768x1024`、`1024x768`、`1440x900`、`1672x941` 共八档尺寸，对首页、馆藏、展厅列表、商城完成 32 组生产页检查：无页面横向滚动或按钮截断。
- 3D 页在 `390x844`、`768x1024`、`1672x941` 均加载 Canvas、无失败回退、无横向滚动；移动信息入口与底部导航间距正常。
- 3D 实体/点云切换、2.4 秒解构、Canvas 拖拽、原生 `grab` 光标、键盘静态降级均通过；最终控制台无 error/warning。
- `/explore` 馆藏卡验证了 `Tab` 后 `data-motion-tier="static"`、active 和 transform 立即清空；鼠标在原卡片内恢复 `full` 后，下一次 surface move 可重新设置 active、局部坐标和受限 transform。
- 最终 3D 重置视角截图中模型完整可见；对截图画布主体区域执行像素检查，亮度范围 `1-209.3`、标准差 `25.25`、亮像素占比 `32.83%`，不是空白 Canvas。
- 普通 `/explore` 路由资源清单中无 Three.js、OrbitControls、GLTFLoader 或后处理分包；这些资源仅在 3D 路由请求。
- 当前验收环境实际报告 `prefers-reduced-transparency: reduce`，探照伪层自动隐藏；减少动态、高对比度、forced-colors、粗指针和分档逻辑由单元测试与 CSS 降级规则覆盖。
- 补充完整键盘回归：3D 信息与商城购物袋 Sheet 的焦点陷阱、`Escape` 和触发器回焦通过；预约日期/时段与必填错误回焦、登录提交、3D 视角，以及后台内容/运营标签方向键均通过。后台标签在浏览器验收中发现语义缺口后已补齐 `aria-controls`、`tabpanel`、动态标签关联与 roving focus。
- 最终生产镜像的 3D 页在八档固定尺寸均为 `overflow=0`、无按钮文字截断、Canvas 数量为 1、`data-render-state="running"`；浏览器控制台无 warning/error。
- 视觉记录：`heluo-pointer-explore-1440x900.png`、`heluo-pointer-3d-1440x900.png`、`heluo-pointer-shop-1440x900.png`，保存在本次 Codex 可视化目录。
- 新增零依赖 CDP 审计命令 `pnpm perf:pointer`，对 `/explore` 与 `/exhibits/heluo-bronze-ding-3d` 分别以 CPU 1x/4x 录制 10 秒 trace；原始压缩 trace、系统偏好截图和汇总写入忽略提交的 `artifacts/performance/`。
- 最终镜像 CPU 1x：`/explore` 指针派发平均 `0.072ms`、RAF 回调平均 `0.050ms`、交互动效增量 `0.011ms`；3D 页指针派发平均 `0.087ms`、RAF 回调平均 `0.214ms`、交互动效增量 `0.022ms`，本次 GLB 资源时长 `661.7ms`，点云已激活且渲染状态为 `running`。
- CPU 4x：持续低帧率后普通馆藏页自动降到 `static`；普通路由仍未请求 Three.js，3D 点云路线仍保持实际运行。包括混合触控笔在内的全部 14 项性能门禁通过。
- 自动后台审计将真实标签切换至隐藏状态约 5 秒：普通页隐藏 `5031.9ms`、3D 页隐藏 `5044.7ms`，两页隐藏期间 RAF 均为 `0`；3D 状态由 `paused-hidden` 恢复为 `running`。
- CDP 媒体模拟证明：减少动态、高对比度和 forced-colors 均停用自定义光标；减少透明度移除探照伪层；200% 等效视口/DPR2 下两页均为 `static`、自定义光标节点为 `0`。八档固定尺寸的 `/explore` 与 3D 页均无页面横向溢出或控件截断，并自动保存截图。
- `390x844` touch/coarse pointer 自动化中两页均为 `static`、无自定义光标且保留系统触控语义；这是桌面 CDP 模拟证据，不替代真实手机手感。
- 混合设备自动化在保持 `fine pointer + hover` 的条件下派发 pen 事件，两页均进入 `restrained`、自定义光标节点为 `0`、系统光标能力类关闭；鼠标事件返回后恢复。当前性能目录共保存 30 张截图。
- 2026-08-03 生产 DOM 补验：首页 `[data-pointer-surface]` 数量为 `0`，只保留 L1；商城背景命中后只有一个 active surface，内联变换保持 `rotateX(0) rotateY(0) translateY(0)`，探照强度可响应；两页均无横向溢出。
- 新增可复现命令 `pnpm qa:pointer-pages`；首页与商城按 `320x800`、`375x812`、`390x844`、`414x896`、`768x1024`、`1024x768`、`1440x900`、`1672x941` 重新执行 16 组当前镜像回归。横向溢出、控件截断、首页误挂 L2、商城背景探照未激活和背景空间位移五项门禁全部通过，截图与汇总位于忽略提交的 `artifacts/page-mapping/`。
- 最终生产浏览器实际计算尺寸为：默认 `30px/6px`、链接 `38px/4px`、主操作 `40px/4px`（外环/内点）；状态变化使用伪元素 `scale()`，不再 transition `width/height`，避免布局抖动。按压 `.86/.72` 由组件测试与 CSS 体积门禁覆盖。
- 管理员使用本地忽略配置完成浏览器登录，`/admin` 与 `/admin/operations` 均为 `static`、自定义光标节点 `0`、Surface `0`、无横向溢出；凭据未写入产物或文档。
- 当前生产镜像重新完成三角色路线：游客未登录后台跳转不闪现壳层，管理员内容/运营页保持 L0，普通用户完成注册、登录、预约、购物袋增减/删除和模拟支付。验收中修复商城状态在桌面购物袋与移动 Sheet 间重复播报的问题；购物袋内保留可见副本，页面 DOM 仅保留一个 `role="status"/"alert"` 直播区域。

### 16.4 设备级证据与剩余人工项

- vivo X100 Ultra 已通过 ADB/CDP 完成首页、3D、预约与商城真机自动化；粗指针使用系统光标，3D 单指滚动、双指缩放、Sheet 拖拽、输入法与底栏遮挡门禁通过。合成触摸与截图不代替真人舒适度判断。
- 2026-08-03 短暂未枚举 ADB 的记录仅为历史状态；vivo X100 Ultra 已重新通过 USB 调试连接，并完成二次 `pnpm uat:android`。3D 单指滚动、双指缩放、Sheet `medium -> full`、点云切换和渲染状态均通过；移动端粗指针仍由能力判断固定为 `static`。
- 当前 Windows 已识别状态为 `OK` 的 ELAN 触控板、Razer Viper V3 Pro，并运行在 `2560x1600 @ 240Hz` 显示模式；用户已完成触控笔、触控板、高刷鼠标、系统大光标与实际 200% 缩放的人工交互确认。
- `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast`、forced-colors、200% 等效视口/DPR2 和 CPU 4x 已通过 CDP 自动化与截图验证；仍需在真实操作系统设置中复核系统大光标与浏览器/系统缩放手感。
- 隐藏挂载、`paused-hidden -> running`、隐藏期间 RAF 为 `0` 已同时由组件测试和 CDP 后台标签审计证明；卸载后的监听器、RAF 与 renderer 清理由组件级测试证明。
- 用户提供的两段手机录像与一段桌面录像已提帧核对：覆盖手机 3D 实体/加载降级/信息 Sheet/点云、商城模拟支付成功，以及桌面首页、3D/点云、预约/馆藏和商城视觉流程。录像未拍摄物理手势、鼠标轨迹、触控笔或系统设置，故仅补充显示结果证据。

### 16.5 验收矩阵

| 验收项 | 证据 | 状态 |
|---|---|---|
| 河洛纸墨视觉、无参考站皮肤复制 | CSS 令牌、页面白名单、生产截图 | 已证明 |
| 单一按需 RAF、单激活 surface | `motionFrame.spec.ts`、`pointerSurface.spec.ts` | 已证明 |
| OrbitControls 中断、320ms 恢复、实时档位约束 | `ThreeExhibitViewer.spec.ts`、`pointerMotion.spec.ts` | 已证明 |
| 隐藏挂载恢复、后台 5 秒零 RAF、卸载清理 | `ThreeExhibitViewer.spec.ts`、`pnpm perf:pointer` | 后台暂停已由浏览器证明；卸载清理为组件级证明 |
| 八档公开页/3D 响应式、Canvas 与生产控制台 | Docker 生产页检查、自动截图与 DOM 门禁 | 已证明 |
| 减少透明度 | 当前系统媒体查询为 reduce，生产 CSS 降级生效 | 已证明 |
| 减少动态、高对比度、forced-colors、200% 等效视口/DPR2 | CDP 媒体模拟、DOM 门禁与截图 | 已证明（自动化环境） |
| 混合设备触控笔切换 | 单元测试、fine/hover 环境 CDP pen 事件与截图、用户人工确认 | 自动化与真实触控笔手感均通过 |
| 粗指针 | 能力单测、CSS 媒体规则、390x844 模拟、vivo Android 真机与用户人工确认 | 自动化与真人触摸手感均通过 |
| 真实手机 | vivo X100 Ultra 二次 `pnpm uat:android`、系统截图、用户手机录像、用户人工确认 | 渲染、合成触摸、视觉流程与真人手感通过 |
| 触控板、高刷鼠标、触控笔、系统大光标、实际 200% 缩放 | 用户 2026-08-03 实体设备确认 | 已证明 |
| 普通页/3D 页 10 秒 Performance、CPU 4x | `pnpm perf:pointer`、`artifacts/performance/summary.json` 与 `.json.gz` trace | 已证明 |
