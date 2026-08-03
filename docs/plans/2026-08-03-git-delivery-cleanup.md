# Git 交付整理与提交计划

## 目标

将已验收的河洛数字博物馆第一版改动按可回滚边界拆分提交，同时移除不具备长期项目价值的本地评审与运行产物。

## 关联需求

- N-06：可维护性与可复现交付。
- A-01、A-02：保留页面图片、3D 源文件、导出文件和来源说明。

## 影响范围

- Git 忽略规则与本地临时目录。
- 前端、后端、部署、资产、测试、负载脚本与项目文档。
- 不修改业务接口、数据库结构、鉴权规则或运行时资源引用。

## 实施步骤

1. 审计未提交与未跟踪文件，区分正式源码/资产/文档和本地运行产物。
2. 删除 `.hallmark/`、`.impeccable/`、`artifacts/`，并将 `.impeccable/` 加入 `.gitignore`。
3. 按后端业务与部署、前端体验与资源、项目文档与验收三组暂存；每组审查 staged diff。
4. 执行类型检查、测试、生产构建、后端测试和 Git 空白检查；提交前确认工作树只剩忽略的本地产物。
5. 使用 Conventional Commits 创建独立提交，不推送远端。

## 保留与删除边界

- 保留：`assets/design-mockups/`、`assets/images/editorial/source/`、`assets/models/bronze-ding/`、`frontend/public/media/`、Flyway 迁移、测试、部署脚本、计划和验收文档。
- 删除：本地评审缓存、临时代理配置、自动化截图/录像提帧、日志和测试输出。

## 验收标准

- 不提交 `.env`、日志、缓存、构建物、测试报告或本地运行产物。
- 每次提交具有独立、可理解的职责和 Conventional Commit 信息。
- `git diff --check`、前端类型检查/测试/构建和后端测试通过。
- 提交后 `git status --short` 不含未预期文件。

## 风险

- 本次历史资产与源文件较大；它们是 A-01/A-02 的可追溯交付物，保留但不与临时构建产物混淆。
- 现有旧版模型删除用于移除已废弃导出物，v5.1 至 v5.4 的有效源文件及当前 v5.4 运行时资源仍保留。

## 验证结果

- 已删除 `.hallmark/`、`.impeccable/` 和 `artifacts/` 本地评审/测试产物，共约 66.1 MB；`.impeccable/` 已加入 `.gitignore`。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm test -- --run`：10 个测试文件、38 项测试通过。
- `corepack pnpm build`：通过；保留既有 Rollup 注释和 Three.js 大分包警告。
- `mvn test -q`：10 项测试通过。
- 分组提交：`b7137de feat(backend): complete museum workflows`、`fb71068 feat(frontend): deliver curated museum experience`、`0b71887 style(frontend): remove trailing whitespace`、`4615ac3 feat(assets): curate museum visual resources`。
- `heluo-bronze-ding-v5.5` 在交付整理期间完成并另行验证、提交；该独立变更保留了 v5.4 回退资产，未与本次清理提交混合。
