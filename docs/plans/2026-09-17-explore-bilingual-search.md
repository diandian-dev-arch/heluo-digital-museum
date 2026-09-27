# Explore 中英文搜索补齐方案

日期：2026-09-17  
状态：本地实现与验收完成；未提交、未部署。  
关联需求：F-02（公开内容检索）；连带保持内容浏览、后台内容管理及原有权限行为。

## 1. 结论

推荐采用“数据库保存中英文标题/摘要，后端统一匹配，前端按语言展示”的方案。

这次补齐的是双语关键词搜索，不是 AI 语义搜索。不新增搜索引擎、向量数据库、翻译服务或付费依赖。

## 2. 现状与问题

本次已核对的实现：

- `frontend/src/views/ExploreView.vue` 的 `artifactEnglish`、`articleEnglish` 保存部分英文标题和摘要，仅用于前端展示。
- Explore 将关键词原样编码后发送给 `/api/v1/search`，不把英文展示映射交给后端。
- `SearchController.java` 仅对 `title`、`summary` 执行 `LIKE` 匹配；文物和文章分支都没有英文检索字段。
- 文物、文章公开列表接口也有 `keyword` 参数，实施时应使用相同的双语匹配规则，避免不同入口结果不一致。
- 后台内容接口、前端内容类型目前没有 `titleEn`、`summaryEn`。

前一轮线上接口抽查：`青铜` 返回 4 条、`bronze` 返回 0 条、`玉` 返回 1 条；这是当时的数据快照，不作为实施后的固定结果数量。`jade` 那次请求没有得到可用的数量，不能写成已验证为 0。

问题本质：用户看到的英文文字没有进入后端检索范围；并非输入框拒绝英文。

## 3. 目标与范围

### 必须达到

1. 中文或英文界面中，都可以输入中文或英文关键词。
2. 文物与文章的中文标题、中文摘要、英文标题、英文摘要均参与匹配。
3. 英文大小写不影响结果，例如 `bronze`、`Bronze`、`BRONZE`。
4. 界面切换语言只改变展示，不改变同一关键词的命中集合。
5. 英文标题、摘要由后台维护；前台列表、搜索结果和详情标题/摘要使用同一份数据。
6. 草稿、撤下、已删除内容及禁用分类仍不可公开检索。
7. 保持现有搜索提交、清除、分页、刷新恢复与返回行为。

### 本轮不做

- 正文全文搜索、拼音搜索、同义词扩展、拼写纠错、自然语言问答。
- 商城、3D 展项等其他资源类型的统一搜索。
- 自动翻译或全站内容国际化；详情正文、材质、时代、分类等既有语言逻辑不在本轮统一迁移。
- 相关度排序或全量重构现有分页机制。

边界示例：英文摘要中有 `bronze` 就可命中；只有中文“青铜”而没有英文译文的新增内容，仍无法保证用 `bronze` 搜到。连续短语按原顺序匹配，不自动拆词；`bronze vessel` 不保证匹配 `bronze ritual vessel`。

## 4. 数据设计

在 `artifacts`、`articles` 两张表各新增两个可空字段：

| 字段 | 建议类型 | 用途 |
|---|---|---|
| `title_en` | `VARCHAR(300) NULL` | 英文标题，适当容纳译文长度 |
| `summary_en` | `VARCHAR(1000) NULL` | 英文摘要，适当容纳译文长度 |

保留原 `title`、`summary` 字段及其中文含义，不改名、不覆盖中文数据。

### 历史数据补齐

1. 盘点现有文物与文章，以 `type + slug` 标识，不依赖自增 ID。
2. 将 Explore 已有的英文标题/摘要迁移为待审译文清单。
3. 补充当前映射缺失内容，例如 `heluo-bronze-ding`；保留“概念展品”“数字重制”的准确含义，不虚构文物年代与来源。
4. 校对译文后，通过版本化数据迁移补齐已知内容；只填空值，不覆盖已有人工译文。
5. 发布前核查所有拟上线公开文物/文章的翻译覆盖率；未知或后续新增内容不能被静态迁移自动覆盖，应通过后台补齐。

结构迁移与数据回填建议分开，编号在实施时检查 SQL 与 Java 迁移后使用下一个未占用版本，不修改已经执行的迁移。

### 后台维护规则

- 文物、文章表单各新增“英文标题”“英文摘要”，保留现有中文字段要求。
- 英文字段暂为可选，避免阻断旧内容编辑；显示缺译提示，明确“未补译的内容无法保证英文命中”。
- 服务端校验最大长度，写入时去除首尾空白，空字符串规范化为 `NULL`。
- PATCH 中“字段省略”表示保持旧值，“显式空字符串或 null”表示清除译文；在接口文档与测试中固定这一区别。
- 复用现有管理员鉴权、操作日志和内容状态流转，不新增公开写入入口。

## 5. 后端检索原理

### 大白话

每条内容原来只有两张可搜索的标签：中文标题、中文摘要。现在再加两张：英文标题、英文摘要。用户输入一个词，后端同时检查四张标签，只要任意一张包含这个词，就返回这条内容。

例如同一条内容：

```text
title      = 河洛青铜鼎（数字重制）
title_en   = Heluo Bronze Ding (Digital Reconstruction)
summary    = 中文摘要……
summary_en = 经校对的英文摘要……
```

输入 `青铜` 命中中文标题；输入 `bronze` 或 `ding` 命中英文标题。二者返回的是同一条文物，不是两条独立内容。

### 查询规则

在现有发布状态、软删除和分类可见性条件之后，用括号包住四字段 OR 条件。示意 SQL（不是可直接部署脚本）：

```sql
WHERE a.status = 'PUBLISHED'
  AND a.deleted_at IS NULL
  AND c.enabled = 1
  AND (
    LOWER(COALESCE(a.title, '')) LIKE ? ESCAPE '!'
    OR LOWER(COALESCE(a.summary, '')) LIKE ? ESCAPE '!'
    OR LOWER(COALESCE(a.title_en, '')) LIKE ? ESCAPE '!'
    OR LOWER(COALESCE(a.summary_en, '')) LIKE ? ESCAPE '!'
  )
```

- 关键词去首尾空白，建议最大 100 个字符；空白或超长请求按项目现有错误信封返回 422。
- 关键词使用 `Locale.ROOT` 小写化，字段使用 `LOWER`，明确英文大小写不敏感；生产 MySQL 与测试数据库都要验证。
- 把 `!`、`%`、`_` 分别转义为 `!!`、`!%`、`!_`，再在两端加 `%`。这些字符按字面搜索，不作为用户可控通配符。
- 所有查询值使用参数绑定，不能拼接用户输入到 SQL。
- 四个字段是同一条记录上的 OR，不需要把中英文结果分别拼接，所以同一条内容不会因双语同时命中而重复。
- 保留当前 `type=all/artifact/article`、排序和分页语义；统一匹配规则复用于两个公开列表的 `keyword` 参数。

这是普通数据库字符串包含匹配，不会理解词义，也不会调用大模型。前导 `%` 与 `LOWER` 不利于普通索引加速；当前先保持小规模内容方案，实施时记录代表数据量与查询耗时，内容增长后再单独评估全文检索。

## 6. API 与前端方案

### API 向后兼容

保留 `/api/v1/search?keyword=...&type=all&page=1&size=24`，不要求调用方新增语言参数。

在搜索结果、文物/文章列表及详情响应中增加可空字段：

```json
{
  "title": "河洛青铜鼎（数字重制）",
  "summary": "原中文摘要",
  "titleEn": "Heluo Bronze Ding (Digital Reconstruction)",
  "summaryEn": "经校对的英文摘要"
}
```

这是单条内容的字段示意，完整响应保留原有信封、分页和其他字段。后台创建、读取、修改接口同步支持新字段。

### 前端展示

```text
用户输入 → 后端搜索四个字段 → 返回双语字段 → 前端按界面语言展示
```

- 中文界面显示 `title`、`summary`。
- 英文界面优先显示 `titleEn`、`summaryEn`；每个字段缺译时独立回退到原中文，不出现空卡片。
- 抽取轻量的共享选文函数，让 Explore 列表、搜索结果和内容详情标题/摘要一致。
- 迁移完成并确认响应后，移除 Explore 中标题、摘要的静态英文兜底；保留本轮未迁移的时代、材质、分类等映射。
- 先更新后端再更新前端，短暂版本不一致时，新前端仍能容忍字段缺失并回退中文。
- 不在浏览器里下载全部数据进行搜索，也不使用 `bronze → 青铜` 的临时词典替代双语内容。

英文界面搜中文也能命中，只是结果优先展示英文；中文界面搜英文同理。搜索范围和显示语言是两件独立的事。

## 7. 影响文件与实施步骤

以下路径均相对仓库根；实施还包含初始化器与对应译文数据，以覆盖全新数据库启动路径。

| 层级 | 预计文件/位置 | 工作 |
|---|---|---|
| 数据库 | `backend/src/main/resources/db/migration/` | 新增结构迁移与受控译文回填 |
| 搜索 | `backend/src/main/java/com/heluo/museum/content/SearchController.java` | 四字段查询及结果字段 |
| 公开内容 | 同目录 `ArtifactController.java`、`ArticleController.java` | 列表/详情输出与 keyword 规则一致 |
| 后台接口 | 同目录 `AdminContentController.java` | 新字段读写、校验与 PATCH 语义 |
| 前端类型 | `frontend/src/lib/content.ts` | 新增可空双语字段 |
| 前台页面 | `frontend/src/views/ExploreView.vue`、`ContentDetailView.vue` | 共享标题/摘要选文逻辑 |
| 后台页面 | `frontend/src/views/AdminContentView.vue` 及其实际请求类型 | 两类内容增加译文字段 |
| 测试 | 相关后端内容测试、前端页面测试与浏览器用例 | 检索、权限、维护、回归 |
| 文档 | `docs/04-data-and-permissions.md`、`05-api-design.md`、`06-test-plan.md`、`07-er-diagram.md` | 同步数据、契约和验收 |
| 决策 | `docs/decisions/` | 确认后记录双语列方案 ADR |

执行顺序：

1. 用户确认范围与方案，再盘点译文、记录 ADR。
2. 新增迁移；在测试数据库验证旧数据保留及回填结果。
3. 完成后端字段读写、查询和自动化测试。
4. 完成后台维护表单及前台共享展示，删除重复的标题/摘要映射。
5. 执行前后端检查、实际浏览器搜索与后台维护闭环。
6. 更新文档、项目状态、需求追踪表，审查 diff，交付本地结果。
7. 只有得到发布授权后才部署；上线前准备数据库备份并验证恢复路径，上线后重新核查迁移、健康和搜索结果。

## 8. 验收清单

| 场景 | 预期 |
|---|---|
| 中文 `青铜`、`玉` | 原中文搜索能力保持，按测试数据核对结果 |
| 英文 `bronze`、`jade` | 命中对应已补译内容 |
| `bronze` / `Bronze` / `BRONZE` | 命中集合一致 |
| 仅出现在英文摘要中的词 | 能命中，证明不是只搜英文标题 |
| 文物、文章分别匹配 | `type` 过滤正确，all 同时包含两类内容 |
| 同一记录多个字段同时命中 | 只返回一次；总数与分页正确 |
| 首尾空格、无结果、空请求、超长输入 | 分别按去空格、空态、422、422处理 |
| `%`、`_`、`!`、引号 | 字面匹配，无通配扩大、SQL 异常或注入 |
| 草稿、撤下、软删除、禁用分类 | 中英文均不能公开搜到 |
| 缺少一个/全部英文字段 | 页面逐字段回退中文，不报错；中文仍可搜 |
| 切换界面语言 | 同一关键词的命中集合、页码不变，展示切换正确 |
| 列表 → 搜索 → 详情 | 同一语言下标题/摘要一致，slug 路由与图片不变 |
| 翻页、清除、刷新、浏览器返回 | 延续现有行为，无重复、漏项或过期响应覆盖 |
| 后台新增/修改/清除译文 | 保存并重新读取正确，公开搜索随内容状态正确变化 |
| PATCH 省略译文字段 | 旧译文不被清除 |
| 未登录/普通用户写入译文 | 保持拒绝，只有管理员可修改 |
| 旧内容与旧调用方 | 中文字段、关联与既有 API 使用不受影响 |

验证层次：

- 后端：定向内容/权限测试及模块完整测试；真实 MySQL 验证迁移、字符集、大小写和 ESCAPE，不能只靠 H2。
- 前端：类型检查、相关单元测试、完整单元测试及生产构建。
- 浏览器：中英文 × 浅深主题 × 桌面/手机视口，走通搜索、清除、返回与详情；本地测试环境走通管理员维护闭环，不向生产写测试内容。
- 发布后：健康/就绪检查、翻译覆盖率及已知中英文查询对照；浏览器视口检查不等于手机真机验收。

## 9. 风险与回退

- **译文不完整**：代码支持不等于所有内容可英文搜索。发布前必须清点目标公开内容；新增内容缺译时要有提示。
- **两处译文不一致**：标题/摘要最终只以数据库为准，前端静态副本在切换时移除。
- **历史中文编辑后英文过时**：后台提示管理员同步核对译文；本轮不加入自动翻译或复杂翻译工作流。
- **匹配能力仍有限**：英文同义词、词序变化不保证命中，界面不得宣称智能搜索。
- **迁移与版本顺序**：新增可空字段后再发布新后端、新前端；回退应用时保留新增列和译文，不通过删列破坏数据。
- **生产恢复**：旧应用需在测试环境验证可与新表结构共存；备份恢复属于单独批准的生产操作，不能随意覆盖用户新数据。
- **现有工作区大量未提交改动**：实施时只修改明确范围，不覆盖无关改动，不自动提交或推送。

## 10. 本次交付与验证状态

### 实施结果

- V25新增双语列、V26补齐9条既有演示内容；新增初始化译文，覆盖迁移先执行、演示内容后创建的全新数据库路径。
- ContentSearch统一四字段、大小写与字面通配符规则；搜索、文物列表、文章列表复用，所有公开可见性条件保留。
- 公开列表/详情/搜索和后台读写返回双语字段；后台两类表单支持填写、修改和清空，省略PATCH字段保持原值。
- 前台使用contentLocale共享选文，移除标题/摘要静态映射，保留分类、材质、时代映射；详情标题、摘要、页面title和description同步选文。
- ADR-004及数据/API/ER/测试文档已同步。本次没有新增依赖、环境变量或外部服务。

### 验证结果

| 检查 | 结果与证据 |
|---|---|
| 前端类型检查 | `pnpm typecheck`通过 |
| 前端完整单测 | `pnpm test`，61文件、331测试通过；`artifacts/bilingual-frontend-tests.log` |
| 前端生产构建 | `pnpm build`包含类型检查、Vite和预算，通过；`artifacts/bilingual-build.log` |
| 后端完整测试及打包 | `mvn -q package`通过，72测试无失败；`artifacts/bilingual-backend-full.log`。之后新增普通用户权限用例在MySQL单独通过 |
| 真实MySQL | MySQL 8.0，双语检索5项、迁移1项、V24回归14项全部通过；`artifacts/bilingual-mysql-tests.log`、`artifacts/bilingual-mysql-permissions.log` |
| 浏览器主验收 | 11场景通过：双语×双主题×390/1440八组、25条真实结果分页一组、文物/文章后台各一组；`artifacts/bilingual-browser-final.log` |
| 浏览器收口 | 分页测试收尾撤回及逐字段回退补验3场景通过；`artifacts/bilingual-browser-closure.log` |
| E2E类型 | `pnpm test:e2e:types`通过 |
| 译文覆盖 | 隔离MySQL中6件文物+3篇文章，9/9双语标题摘要非空；未覆盖未知生产新增内容 |
| 旧版本兼容 | 既有旧版JAR（迁移截至V24）连接V26隔离库：ready UP、文物6条、中文青铜4条，旧响应不含英文字段；`artifacts/bilingual-old-backend.log`。临时旧进程已停止 |
| 查询耗时 | 隔离库34条公开内容时，20次bronze HTTP串行请求中位5.84ms、P95 9.27ms、最大9.34ms；仅小规模本机观察，不是负载或生产SLA证明 |
| Git与视觉 | 相关diff检查无空白错误；人工查看手机英文浅色馆藏和桌面后台译文字段截图，未发现新增字段溢出/遮挡 |

初轮失败已解决：V24测试原先无上限执行所有后续迁移，调整为明确只验证V24，新增独立双语迁移测试承接后续升级验证；前端两处表单测试改用字段标签而非textarea下标，英文展示测试使用API双语字段。没有跳过或降低断言来掩盖实现失败。

### 交付边界

- 本地预览：`http://127.0.0.1:4192/explore`，使用独立MySQL测试库；公开内容已恢复为6件文物、3篇文章，测试记录仅撤回、未删除。
- 未做生产迁移/部署、生产备份恢复演练、实体手机、全站完整业务E2E或大数据量负载测试。这些不作为本轮已通过项。
- 发布前须在授权范围核对生产待发布内容译文覆盖率、备份恢复和部署后的健康/搜索；不能把本地完成解释为线上已更新。
- 后续英文正文、同义词和语义搜索仍不在本轮范围；新增内容的英文命中仍依赖管理员填写译文。

### 实际修改文件清单

以下均相对仓库根 `C:/Users/Jie/Documents/博物馆`，仅列本轮触及文件，不包含工作区原有无关改动：

```text
backend/src/main/resources/db/migration/V25__add_content_english_fields.sql
backend/src/main/resources/db/migration/V26__backfill_content_english.sql
backend/src/main/java/com/heluo/museum/content/ContentSearch.java
backend/src/main/java/com/heluo/museum/content/SearchController.java
backend/src/main/java/com/heluo/museum/content/ArtifactController.java
backend/src/main/java/com/heluo/museum/content/ArticleController.java
backend/src/main/java/com/heluo/museum/content/AdminContentController.java
backend/src/main/java/com/heluo/museum/config/BootstrapDataInitializer.java
backend/src/main/java/com/heluo/museum/config/SeedContentEnglish.java
backend/src/test/java/com/heluo/museum/content/BilingualSearchTests.java
backend/src/test/java/com/heluo/museum/config/BilingualMigrationTests.java
backend/src/test/java/com/heluo/museum/config/BootstrapDataInitializerTests.java
backend/src/test/java/com/heluo/museum/config/DingAssociationMigrationTests.java
frontend/src/lib/content.ts
frontend/src/lib/contentLocale.ts
frontend/src/lib/contentLocale.spec.ts
frontend/src/views/ExploreView.vue
frontend/src/views/ContentDetailView.vue
frontend/src/views/AdminContentView.vue
frontend/src/views/ExploreReferenceLayout.spec.ts
frontend/src/views/AdminQuality.spec.ts
frontend/src/views/RemediationViews.spec.ts
frontend/e2e/bilingual-search.e2e.ts
docs/decisions/ADR-004-bilingual-content-search.md
docs/plans/2026-09-17-explore-bilingual-search.md
docs/04-data-and-permissions.md
docs/05-api-design.md
docs/06-test-plan.md
docs/07-er-diagram.md
docs/01-requirements-traceability.md
PROJECT_STATUS.md
```
