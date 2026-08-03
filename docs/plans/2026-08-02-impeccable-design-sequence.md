# Impeccable 设计顺序执行计划

## 目标

按用户确认的顺序完成 Impeccable 初始化、展项页评审、全局样式审计和浏览器视觉迭代，保持现有河洛数字博物馆业务契约与 3D 点云行为不变。

## 关联需求

- F-05：游客可进入 3D 展厅查看已发布展项。
- N-03：桌面和手机端无关键横向溢出，交互状态可理解。
- N-04：保持当前本机性能基线，不引入无必要依赖。

## 影响范围

- 产品上下文：`PRODUCT.md`
- Live 配置：`.impeccable/live/config.json`
- 评审与审计输出：Impeccable 记录及必要的 `docs/plans/`
- 页面目标：`frontend/src/views/ExhibitDetailView.vue`
- 样式目标：`frontend/src/assets/main.css`

## 顺序

1. 根据现有 README、需求追踪、设计系统和项目状态建立产品上下文，并配置 Live。
2. 对三足青铜鼎展项页进行 UX/UI 评审，记录优先级和证据。
3. 对全局样式进行响应式、无障碍和性能审计，验证已知布局动画风险。
4. 启动 Live，打开实际开发服务器页面，等待用户选择元素或发出视觉调整指令。

## 验收标准

- `PRODUCT.md` 包含 Register、Platform、Users、Purpose、Positioning、Brand Personality、Anti-references、Design Principles 和 Accessibility。
- Live 配置指向实际 Vite HTML 入口，CSP 检查已完成。
- 评审和审计输出可定位到具体文件、问题和下一步，不自动扩大到业务重构。
- Live 能连接本地开发页；未收到用户视觉选择时不自动改写业务页面。

## 风险

- 工作区包含大量未提交用户改动，任何后续样式修改必须限制在本任务范围并审查 diff。
- 当前项目已有设计系统和点云动效，评审应优先指出真实可用性风险，不以换主题为目标。
- 真实手机触摸性能、系统级减少动态/高对比度和完整键盘流程仍需设备验收。

## 验证记录

- 2026-08-02：已读取 `AGENTS.md`、`PROJECT_STATUS.md`、`README.md`、需求追踪、`DESIGN.md` 和相关前端源码。
- 2026-08-02：`detect-csp.mjs` 返回 `shape: null`。
- 2026-08-02：已生成并验证 `PRODUCT.md` 与 `.impeccable/live/config.json`。
- 2026-08-02：展项页 dual-agent critique 得分 27/40；检测器 0 项，浏览器确认移动信息入口不可见、3D 手势冲突和 Dock/底栏重叠。
- 2026-08-02：`main.css` 技术审计得分 11/20；检测器确认 1 项 `transition: padding` 布局动画风险。
- 2026-08-02：Live helper 在 8400 端口运行；Vite 开发页在 5173 端口返回 HTTP 200，真实 API、3D Canvas 和 Live picker 均加载，控制台无 warning/error。
