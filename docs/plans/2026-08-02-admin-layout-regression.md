# 后台管理布局回归修复计划

## 目标

修复 `/admin` 与 `/admin/operations` 因后台专用样式缺失导致的原生排版、超大 SVG 图标和登录跳转闪屏，恢复纸墨后台工作台布局，不改变 API、权限或业务动作。

## 关联需求

- F-04：后台内容管理。
- F-07：后台预约管理。
- F-11：后台商品与订单管理。
- F-13：后台运营统计。
- N-03/N-06：响应式与前端工程检查。

## 影响范围

- `frontend/src/assets/main.css`：恢复后台壳层、表单、列表、统计和响应式样式。
- `frontend/src/views/AdminContentView.vue`：管理员身份确认前不渲染后台壳层。
- `frontend/src/views/AdminOperationsView.vue`：管理员身份确认前不渲染后台壳层。
- `PROJECT_STATUS.md`、`docs/01-requirements-traceability.md`：记录修复和验证结果。

## 步骤

1. 对照后台组件类名补齐对应 CSS，并显式约束侧栏 SVG 尺寸。
2. 收紧后台页面的权限初始化渲染，消除未登录跳转期间的后台闪屏。
3. 运行类型检查、单元测试与生产构建。
4. 重建 Docker 前端并在 8088 验证桌面与移动端布局、资源和控制台状态。

## 验收标准

1. 管理员访问 `/admin` 时显示完整侧栏和内容工作台，不出现超大黑色 SVG。
2. 未登录访问 `/admin` 时进入登录页，不短暂渲染后台工作台。
3. `/admin` 与 `/admin/operations` 在桌面和 390px 宽度下无关键横向溢出。
4. 类型检查、单元测试和生产构建通过；Docker 前端重新运行并返回 200。

## 风险

- 当前工作区包含大量既有未提交改动，本次只追加后台相关样式和最小权限渲染保护，不回退其他页面修改。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：3 个测试文件、7 项测试通过。
- `corepack pnpm build`：通过；保留既有字体与 Three.js 大分包提示。
- Docker Compose 标准重建：因 Docker Hub 连接超时未完成；随后使用已通过构建的 `frontend/dist` 更新运行中的 Nginx 容器，并将容器固化为本地 `deploy-frontend:latest` 镜像。
- 生产资源检查：`http://127.0.0.1:8088/admin` 返回 HTTP 200，实际 CSS 包含 `.admin-workspace` 与 `.admin-sidebar nav a svg`。
- 未登录浏览器回归：访问 `/admin` 后进入 `/login`，后台壳层和侧栏 SVG 数量均为 0，无横向溢出或控制台错误。
- 管理员桌面回归：`/admin` 显示 212px 侧栏、21×21px 图标，页面宽度等于视口宽度，控制台错误为 0。
- 390×844 回归：`/admin` 与 `/admin/operations` 均无横向溢出，侧栏转为顶部导航，运营趋势区正常显示，控制台错误为 0。
