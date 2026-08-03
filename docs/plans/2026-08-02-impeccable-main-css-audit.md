# Impeccable main.css 技术审计

## 审计范围与证据

- 目标文件：`frontend/src/assets/main.css`
- 关联运行时：`frontend/src/assets/interaction.css`、`frontend/src/main.ts`
- 静态检测：`detect.mjs --json frontend/src/assets/main.css`
- 浏览器证据：`http://localhost:8088/exhibits/heluo-bronze-ding-3d`，桌面 1280x720 与移动 390x844
- 本次只审计，不修改页面样式或业务代码。

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|---:|---|
| 1 | Accessibility | 2/4 | 全局焦点和减少动态规则良好，但存在低对比辅助文字、多个小于 44px 控件和移动入口不可见问题。 |
| 2 | Performance | 3/4 | 3D 页面控制台无错误；检测器发现一处 padding 布局动画，另有较多 blur/shadow。 |
| 3 | Theming | 2/4 | OKLCH 令牌体系存在，但文件仍有约 140 个 hex 和 151 个 rgb/rgba 局部值。 |
| 4 | Responsive Design | 2/4 | 有 17 个媒体查询且浏览器无页面级横溢出，但移动信息入口和 Dock/底栏空间冲突已复现。 |
| 5 | Anti-Patterns | 2/4 | 核心展项有身份，但全局仍可见重复玻璃材质、渐变和小型 eyebrow 等类别反射。 |
| **Total** | | **11/20** | **Acceptable，需先处理移动可达性和主题一致性** |

## Anti-Patterns Verdict

**部分通过。** 3D 展项本身不是通用 AI 模板，真实模型、来源和点云状态很具体；但 `main.css` 在多个页面重复使用 `backdrop-filter`（14 处）、渐变（28 处）、局部 rgba/hex，以及小型高字距 eyebrow。它们在单个页面可以成立，集中叠加后会带来玻璃拟态和装饰性层叠的反射感。检测器唯一命中是布局属性动画，不是视觉反模式。

## Executive Summary

- Audit Health Score：**11/20**（Acceptable）
- 问题统计：P0 0，P1 3，P2 5，P3 2
- 首要问题：移动端信息入口不可见、移动 Dock 与底栏重叠、低对比辅助文字/局部硬编码令牌
- 建议顺序：先用 `adapt` 修移动几何与手势，再用 `colorize`/`typeset` 修可读性，最后用 `optimize` 清理布局动画和高成本效果

## Detailed Findings

### [P1] 移动展项信息入口不可达

- **Location**：`frontend/src/assets/main.css:383`，`.mobile-exhibit-info-trigger`
- **Category**：Accessibility / Responsive
- **Impact**：运行时按钮为 `position: static`，390px 下矩形为 `x=-56,width=112`；视觉上不可见，点击后 BottomSheet 不打开。
- **WCAG/Standard**：项目设计系统要求交互控件最小 44px；也违反可见焦点与可操作性要求。
- **Recommendation**：给触发器建立定位上下文，采用安全区感知的 `position:absolute/fixed`、`min-height:44px` 和稳定 z-index；在 320/375/390/414px 回归。
- **Suggested command**：`/impeccable adapt`

### [P1] 低对比辅助文字未达到 4.5:1

- **Location**：`frontend/src/assets/main.css:286` 的 `#85908e` on `#fbfbf9`，以及 `:285-286` 的 `#798784` / `#788682`
- **Category**：Accessibility / Theming
- **Impact**：计算对比度约为 3.18:1、3.74:1 和 3.80:1；小字号购物袋、元数据和辅助说明在浅色背景上难以阅读。
- **WCAG/Standard**：WCAG 2.2 AA 1.4.3，普通文字至少 4.5:1。
- **Recommendation**：改用 `--color-muted` 的更深层级或为浅色表面增加专用 `--color-muted-strong`，并复测所有浅色背景组合。
- **Suggested command**：`/impeccable colorize`

### [P1] 主题令牌与局部颜色长期分叉

- **Location**：`frontend/src/assets/main.css` 全文件；约 140 个 hex、151 个 rgb/rgba，深色展厅集中在 `:572-618`
- **Category**：Theming / Maintainability
- **Impact**：主题切换、对比度修复和未来页面复用必须逐条追踪局部值；设计系统明确禁止页面局部独立颜色。
- **Recommendation**：把展厅纸面、深墨、金属、边框和阴影收敛到命名令牌，保留必要的资产滤镜值并写明例外。
- **Suggested command**：`/impeccable extract` 或 `/impeccable colorize`

### [P2] 布局属性动画造成潜在布局抖动

- **Location**：`frontend/src/assets/main.css:360`，`.corridor-home__routes a { transition: padding ... }`
- **Category**：Performance
- **Impact**：检测器命中 `layout-transition`；hover 时改变 padding 会触发布局计算，低端设备上可能造成抖动。
- **Recommendation**：改用 `transform: translateX()` 或伪元素位移，保持布局尺寸不变。
- **Suggested command**：`/impeccable optimize`

### [P2] 移动 Dock 与固定底部导航空间冲突

- **Location**：`frontend/src/assets/main.css:612-618` 的移动 `.immersive-exhibit .exhibit-dock` 与全局移动底栏
- **Category**：Responsive
- **Impact**：390px 下 Dock y=556、h=263，固定底栏 y=768、h=64，垂直重叠约 51px，视角控件和内容可能被遮挡。
- **Recommendation**：为页面底部内容预留底栏高度和 `env(safe-area-inset-bottom)`，或让 Dock 在底栏前结束并保持页面滚动。
- **Suggested command**：`/impeccable adapt`

### [P2] 移动 3D 手势策略与页面滚动冲突

- **Location**：`frontend/src/components/ThreeExhibitViewer.vue:155` 及相关 canvas 交互样式
- **Category**：Responsive / Accessibility
- **Impact**：画布中心单指上滑会放大模型而不是滚动页面，首屏用户容易误认为无法继续浏览。
- **Recommendation**：移动端单指默认交给页面滚动，双指才旋转/缩放；或增加显式互动开关。
- **Suggested command**：`/impeccable adapt`

### [P2] 多个交互控件低于项目 44px 触控基线

- **Location**：`main.css:250` 模式按钮 34px，`:273` 日期箭头 30px，`:286` 数量按钮 24-25px，`:337` 视角缩略图 57px 高但宽度仅 74px；其他表单按钮多为 40-42px。
- **Category**：Accessibility / Responsive
- **Impact**：移动设备上小目标增加误触，尤其是日期、数量和模式切换。
- **Recommendation**：交互命中区统一至少 44x44px，视觉图形可保留更小但放在扩大后的按钮盒内。
- **Suggested command**：`/impeccable adapt`

### [P3] 3D 展厅的玻璃材质与阴影成本偏高

- **Location**：`main.css:372-374`、`:576-581`，以及全文件 14 处 `backdrop-filter`
- **Category**：Performance / Anti-Pattern
- **Impact**：透明模糊叠加在 3D 画布和移动设备上会增加合成成本，也强化装饰性玻璃层。
- **Recommendation**：只保留信息面板的必要模糊，其他区域退回不透明令牌表面；在低画质和 `prefers-reduced-transparency` 下验证。
- **Suggested command**：`/impeccable optimize`

### [P3] 页面 CSS 长期追加覆盖，维护成本高

- **Location**：`frontend/src/assets/main.css`，813 行、111,418 字符，多段同选择器覆盖
- **Category**：Performance / Maintainability
- **Impact**：同一展项选择器在早期基础样式、参考图覆盖和 v5.4 深色覆盖中重复出现，后续修复容易只改到错误层级。
- **Recommendation**：完成移动问题后，按页面模块合并重复选择器，保留一次最终令牌层和一次响应式层；不要在本轮扩大到全站重构。
- **Suggested command**：`/impeccable distill`

## Patterns & Systemic Issues

- 硬编码颜色同时出现在基础样式和后续参考图覆盖层，属于系统性令牌漂移。
- 交互尺寸在同一文件中从 24px 到 48px 不等，缺少统一的触控基线。
- 全局已经通过 `interaction.css` 提供 `prefers-reduced-motion`、`prefers-reduced-transparency` 和 `prefers-contrast: more`，这是应保留并扩展的基础。

## Positive Findings

- `main.ts` 明确加载 `main.css` 和 `interaction.css`，减少动态偏好规则遗漏的风险。
- 全局有统一 `:focus-visible` 轮廓，且使用 `--color-focus` 令牌。
- `html/body` 使用 `overflow-x: clip`，浏览器实测桌面与 390px 页面无级别横向溢出。
- 3D 页面桌面点云切换、画质状态和控制台均通过实测，未发现运行时 warning/error。
- CSS 具备 17 个媒体查询，说明响应式结构已建立，不是桌面页面简单缩放。

## Recommended Actions

1. **[P1]** `/impeccable adapt`：修复移动信息入口、Dock/底栏重叠、3D 手势和小触控目标。
2. **[P1]** `/impeccable colorize`：收敛低对比辅助文字和展厅局部颜色到命名令牌。
3. **[P2]** `/impeccable optimize`：替换 `transition: padding`，减少不必要的 blur/shadow。
4. **[P2]** `/impeccable distill`：在不影响业务的前提下合并重复展厅覆盖层。
5. **[P2]** `/impeccable polish`：完成修复后的最终视觉和状态收尾。
