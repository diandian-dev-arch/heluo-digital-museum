# 项目精简与性能优化实施计划

## 目标

在不改变公开路由、API、权限、预约、订单和模拟支付逻辑的前提下，删除可证明无用或可重建的文件，缩小首屏资源与生产目录，并补齐静态资源缓存、压缩和 v5.4 WebP 封面迁移。

## 关联需求

- F-05、A-01、A-02：3D 展项及图片、模型资产可追溯。
- N-03：桌面与移动端页面可用。
- N-04：本机公开读接口性能。
- N-05：部署、迁移和健康检查。
- N-06：工程可维护性与构建质量。

## 影响范围

- 前端入口、公开页、后台选择器、字体和图片加载策略。
- `frontend/public` 运行时图片/模型、Nginx 压缩与缓存配置。
- v5.4 展项初始化数据、Flyway V16 迁移及新库初始化测试。
- 根目录 QA 产物、模型工作台输出、可重建恢复副本和无用脚手架文件。
- 项目状态、需求追踪、测试计划及图片/模型资产台账。

## 删除清单与保留边界

删除项均已复核引用：Vue 默认脚手架、未引用样式和示例图标；根目录 `.qa-*.png`、`artifacts/`、两个模型工作台输出目录、Blender `*.blend1`；v5.2/v5.4 之外的运行时/导出 GLB 及仅验证已删除导出的脚本。

保留项：正式设计效果图、版权和来源记录、Blender 源文件、贴图、建模脚本、第三方只读源文件、Flyway 历史迁移，以及 v5.4 生产模型和较小的 v5.2 人工回退模型。

## 实施步骤

1. 建立删除边界并补充 `.gitignore`，不覆盖工作区既有未提交改动。
2. 移除生产 Live 注入、全局 Element Plus 和 Noto Sans SC Web 字体；公开页复用 `InlineStatus`，后台按页局部导入选择器。
3. 将页面环境图和 v5.4 降级封面转为 WebP，高质量 PNG 移至源资产目录；补充非首屏图片懒加载。
4. 新增 Flyway V16，并使新库初始化器直接写入 v5.4 模型和 WebP 封面。
5. 配置 gzip、哈希资源长期缓存、媒体七天缓存、HTML no-cache 与 API no-store。
6. 完成工程、容器、HTTP、浏览器、3D 像素和 N-04 回归，更新项目文档。

## 验收标准

- 首屏 JS gzip 不超过 220 KB，全局 CSS gzip 不超过 80 KB，`frontend/dist` 不超过 22 MB。
- Three.js 保持路由懒加载，不进入首页首屏请求。
- v5.4 为默认模型，v5.2 文件可用；V16 只更新封面扩展名且不修改历史迁移。
- HTML、哈希资源、媒体和 API 响应头符合缓存策略，生产 HTML 不含 `localhost:8400`。
- 前后端测试和生产构建通过；三个服务运行、MySQL healthy、首页与健康接口可用。
- 公开核心页和后台选择器通过桌面与 390px 模拟回归；真实手机性能单独保留待验。

## 风险

- 工作区包含大量本任务前的未提交改动；本轮不回退、不提交、不推送。
- Docker Hub 曾出现基础镜像拉取超时；最终重试成功，外部镜像仓库可用性仍是后续重建的环境风险。
- v5.2 仅作为人工回退资产，不实现新的自动回退机制。

## 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：9 个测试文件、26 项测试通过。
- `corepack pnpm build`：通过；Vite 报告首屏 JS gzip 96.58 KB、CSS gzip 59.83 KB，`dist` 15.01 MiB，均低于目标。
- `mvn test`：7 项测试通过；H2 新库成功执行 16 条 Flyway 迁移，初始化测试通过。
- Three.js 保持懒加载分包；桌面与移动截图及像素方差检查均为非空画布。
- Docker：`docker compose build --pull backend frontend` 成功，三个服务使用当前镜像全量重建；MySQL healthy，backend/frontend 运行，`/` 与 `/api/v1/health` 返回 200，MySQL 保持 V16。
- 响应头：HTML `no-cache`；哈希 JS/CSS `max-age=31536000, immutable` 且 gzip；媒体 `max-age=604800`；API `no-store`。
- 资源：v5.4、v5.2 GLB 和 WebP 图片返回 200；展项 API 返回 v5.4 与 WebP 封面；生产 HTML无 Live 注入。
- 浏览器：`/`、`/explore`、`/exhibits`、3D 详情、`/appointment`、`/shop`、`/admin`、`/admin/operations` 在 1440x900 和 390x844 模拟尺寸无页面级横向溢出或坏图；两个后台下拉浮层可打开。
- N-04：全量重建后 100 请求全部成功，成功率 100%，P50 13ms、P95 154ms、最大 186ms，达到本机课程项目标准。
- 未验证：真实手机触摸、字体渲染和 3D 性能。
