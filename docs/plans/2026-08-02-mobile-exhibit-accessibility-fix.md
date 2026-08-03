# 数字展项移动端可达性修复计划

## 目标

修复三足青铜鼎数字展项在移动端的信息入口、触摸滚动和底部导航遮挡问题，使访客能够自然浏览页面、打开展项信息并继续使用实体/点云、视角和预约功能。

## 关联需求

- F-05：游客可进入 3D 展厅查看并操作已发布展项。
- N-03：移动端布局与核心操作可用，无关键内容被遮挡。
- N-06：3D 失败和辅助交互保持可理解的降级路径。

## 已确认问题

1. `390x844` 下“查看展项信息”按钮为 `position: static`，`translateX(-50%)` 使其落到 `x=-56`。
2. OrbitControls 将 Canvas 触摸行为设为 `none`，单指纵向上滑被模型缩放/旋转截获。
3. 展项 Dock 与固定移动底栏重叠约 51px，末端视角区域可能被遮挡。
4. 视角和导览当前态只有视觉 class，缺少完整 ARIA 状态。

## 适配策略

### 信息入口

- 仅在 `<=760px` 显示。
- 绝对定位到展厅场景底部、Dock 上方，使用稳定的 `inset-inline` 居中方式，不再依赖静态流负位移。
- 点击区至少 44px，补充 `aria-haspopup="dialog"` 和 `aria-expanded`。

### 3D 触摸

- 桌面鼠标行为保持不变。
- 移动或粗指针设备将 Canvas `touch-action` 设为 `pan-y`：纵向单指交还页面滚动，横向拖动仍可旋转。
- 双指使用 OrbitControls 的 `DOLLY_ROTATE`，保留模型缩放与旋转。
- 不改变相机边界、点云状态机、画质分档和资源释放。

### Dock 与底栏

- Dock 在移动端为固定底栏预留足够的尾部安全区，确保最后一排可交互内容位于底栏上方。
- 页面补充 `scroll-padding-bottom` 与 safe-area，焦点和横向视角列表可滚动到可见区域。
- 保留五项移动底部导航，不通过隐藏核心导航规避问题。

### 语义状态

- 视角按钮增加 `aria-pressed`。
- 当前导览节点增加 `aria-current="step"`。
- 信息按钮打开 Sheet 时同步 `aria-expanded`。

## 影响文件

- `frontend/src/views/ExhibitDetailView.vue`
- `frontend/src/components/ThreeExhibitViewer.vue`
- `frontend/src/assets/main.css`
- `frontend/src/lib/exhibitInteraction.ts`
- `frontend/src/lib/exhibitInteraction.spec.ts`
- `.impeccable/live/api-proxy.mjs`（仅 Live 回归使用的本地展项回退）
- `PROJECT_STATUS.md`
- `docs/01-requirements-traceability.md`

## 实施步骤

1. 提取移动 Canvas 触摸策略为纯函数，便于单元测试。
2. 在 Three.js 初始化时应用触摸策略，并保持桌面默认行为。
3. 修复信息按钮定位、尺寸、层级和 ARIA 状态。
4. 为 Dock 与页面增加移动底栏安全空间，补齐焦点滚动余量。
5. 增加纯函数与页面语义测试。
6. 运行类型检查、单元测试和生产构建。
7. 在 320、375、390、414、768、1440px 检查按钮位置、控件/底栏遮挡、页面滚动、Sheet、实体/点云和控制台。

## 验收标准

- 320–414px 下信息按钮完整位于视口内，尺寸不小于 44px，点击后出现 `role="dialog"`。
- 移动 Canvas 计算样式为 `touch-action: pan-y`；纵向手势可滚动页面，双指模型交互保留。
- Dock 最后一个交互控件可滚动到固定底栏上方，焦点不会落在遮挡区域。
- 视角按钮暴露正确 `aria-pressed`，当前导览节点暴露 `aria-current="step"`。
- 桌面 3D、相机、点云动画、加载/失败降级和正式 URL 不回归。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。

## 风险与回退

- `touch-action: pan-y` 会把垂直单指手势优先交给页面；模型垂直旋转已受极角限制，接受以移动浏览可用性优先。
- 浏览器模拟不能替代真实 iOS/Android 触摸验证；本轮完成浏览器和静态行为证据，真实设备仍单列待验收。
- 若双指手势在特定浏览器不稳定，回退为显式“进入互动”模式，不恢复全屏截获滚动。

## 验证结果

- 已完成移动触摸策略纯函数与单元测试；移动/粗指针使用 `pan-y`，双指保留 `DOLLY_ROTATE`。
- `320`、`375`、`390`、`414`、`768`、`1440px` 浏览器回归通过：页面无关键横向溢出；`320-414px` 信息按钮完整可见且高度 `44px`；移动 Dock 为两列，末端视角按钮底部 `727px`，固定底栏顶部 `768px`，保留约 `41px` 可见间距。
- 信息按钮点击后 `aria-expanded` 从 `false` 更新为 `true`，页面出现可见 `role="dialog"`；点云导览点击后 `aria-pressed="true"`，当前步骤暴露 `aria-current="step"`；视角按钮暴露对应 `aria-pressed`。
- 桌面 `1440x900` 与移动 `390x844` 截图目视检查通过，3D 模型和展台均正常渲染；控制台无页面错误，仅记录 Chromium/Three.js 精度提示。
- `pnpm typecheck`：通过。
- `pnpm test`：4 个测试文件、12 项测试通过。
- `pnpm build`：通过；保留既有字体/Three.js 大分包和第三方 PURE 注释提示。
- Docker 当前不可用，因此未重建 `8088` 正式容器；浏览器回归使用本地 Vite 页面和仅供 Impeccable Live 使用的展项静态回退数据，不改变正式 API 或业务契约。
- 真实 iOS/Android 触摸、系统级减少动态/透明度及高对比度仍待设备验收。
