# 当代东方数字策展前端实施计划

- 日期：2026-08-01
- 状态：已完成（待项目组视觉确认）
- 关联需求：F-01、F-05、F-06、F-09、F-12、N-03、N-06
- 视觉依据：`assets/design-mockups/2026-08-01-frontend-redesign/curation-01-home-v2.png` 至 `curation-05-shop.png`

## 目标

将项目组选择的“当代东方数字策展”方向落实到真实 Vue 页面。保留现有接口、表单校验、登录跳转、购物车、模拟支付、Three.js 交互和中英文切换，不以静态效果图替代功能。

## 影响范围

- `frontend/src/App.vue`：统一导航、移动端菜单、页脚。
- `frontend/src/assets/main.css`：设计令牌、响应式布局、交互与无障碍焦点样式。
- `frontend/src/views/HomeView.vue`：首页策展式主视觉与入口模块。
- `frontend/src/views/ExploreView.vue`：馆藏搜索、分类与非等宽展品网格。
- `frontend/src/views/ExhibitsView.vue`、`frontend/src/views/ExhibitDetailView.vue`：数字展厅入口与 3D 信息布局。
- `frontend/src/views/AppointmentView.vue`：预约路径、时段、表单与来访信息。
- `frontend/src/views/ShopView.vue`：文创陈列与购物车。

## 实施步骤

1. 建立月白、青玉、墨色、朱砂、铜锈五类设计令牌，以及河洛路径线和坐标节点。
2. 统一桌面/移动端导航、标题层级、按钮、输入框、反馈状态与页脚。
3. 分别重构首页、馆藏、数字展厅、预约、商城；所有数据继续由既有 API 驱动。
4. 在 390px、桌面宽度下检查核心页面布局；验证类型检查、单元测试、生产构建与浏览器核心路径。

## 验收标准

- [x] 五个核心页面均采用统一的当代东方策展视觉语言，且不使用效果图作为页面背景或文字内容。
- [x] 现有内容搜索、展项入口、预约提交、加入购物车和模拟支付逻辑保持现有 API 与组件逻辑；本轮未提交真实预约或支付。
- [x] 桌面端无关键横向溢出；390px 下导航、表单和商品操作仍可用。
- [x] `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- [x] 浏览器逐页核对首页、馆藏、3D、预约、商城的视觉和基本交互。

## 风险

- 效果图中的静态文案与固定数据必须由真实接口状态取代。
- 3D 视图需要保留资源释放与低性能降级，不应为了外观而移除现有 WebGL 边界。
- 本轮工作区已有其他未提交业务改动；仅审查和修改本计划列出的前端/文档文件。

## 验证结果

- 2026-08-01：`corepack pnpm typecheck` 通过。
- 2026-08-01：`corepack pnpm test` 通过（1 个测试文件、1 个测试）。
- 2026-08-01：`corepack pnpm build` 通过；仅保留现有第三方注释与包体积警告。
- 2026-08-01：`docker compose -f deploy/compose.yaml up --build -d frontend` 后，`deploy-frontend-1` 运行于 `http://localhost:8088/`。
- 2026-08-01：浏览器已逐页核对 `/`、`/explore`、`/exhibits`、`/appointment`、`/shop`；另在 390px 宽度核对首页导航与主视觉。
