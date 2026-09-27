# 数据模型与权限

## 2026-09-17 双语标题与摘要

`artifacts`、`articles` 保留中文 `title/summary`，各新增可空 `title_en VARCHAR(300)`、`summary_en VARCHAR(1000)`，由 V25 添加结构、V26 对已知 slug 的空译文回填。新演示内容首次初始化时带相同译文；已有内容不被初始化器覆盖，主动清空后重启不会复填。

译文与原记录共用分类、发布状态、软删除和管理员权限；没有独立的公开权限。后台创建/PATCH 仅允许 ADMIN，PATCH 省略字段保持原值，显式 null/空白清除。公开搜索范围为四字段，缺译不会隐去中文内容。详见 [ADR-004](decisions/ADR-004-bilingual-content-search.md)。

- 文档版本：v0.3
- 最后更新：2026-08-16
- 本次同步：补充已由 Flyway `V23__add_mobile_exhibit_model.sql` 落地的移动 3D 模型字段及后端校验规则；其余字段仍以当前迁移和代码为准。
- 技术依据：[ADR-001：技术栈选择](decisions/ADR-001-tech-stack.md)、[ADR-003：内容与商品采用软删除](decisions/ADR-003-content-soft-deletion.md)。
- 关联需求：F-04、F-06、F-07、F-08、F-10、F-11、N-01、N-02。

## 1. 设计原则与命名约定

- 数据库目标为 MySQL 8；表名、字段名使用 `snake_case`，主键与外键使用无业务含义的 `BIGINT UNSIGNED`。
- 游客是未登录访问状态，不在 `users` 表中创建“游客账号”。
- 数据模型允许一个用户拥有多个角色；但第一版业务规则只启用一个 `ADMIN` 账号，其他注册或创建账号均为 `USER`。
- 密码只存储哈希摘要；任何查询、日志和接口响应均不得输出密码摘要、令牌或敏感凭据。
- 用户禁用使用账号状态，不通过物理删除破坏预约、订单和操作日志的历史关联。
- 创建/更新时间使用 `DATETIME(3)`；应用统一使用 UTC 写入，前端按用户时区显示。

## 2. 领域关系概览

```text
游客
  └─ 公开浏览，无数据库账号

users  N ── N  roles
          通过 user_roles 关联

users
  ├─ 后续关联 appointments（一个用户有多个预约）
  ├─ 后续关联 orders（一个用户有多个订单）
  └─ 后续关联 operation_logs（管理员执行操作）
```

## 3. 表：`users`

保存已注册用户和管理员的基本身份信息。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_users` | 用户唯一标识。 |
| `username` | `VARCHAR(32)` | 是 | — | 唯一 `uq_users_username` | 登录账号；建议 3～32 位英文字母、数字或下划线。 |
| `password_hash` | `VARCHAR(255)` | 是 | — | — | 使用 BCrypt 保存的密码摘要，绝不保存明文。 |
| `nickname` | `VARCHAR(50)` | 是 | — | `idx_users_nickname`（仅后台模糊查询需要时建立） | 前台展示名称，可与用户名不同。 |
| `email` | `VARCHAR(254)` | 否 | `NULL` | 唯一 `uq_users_email` | 邮箱；若填写必须格式合法。MySQL 唯一索引允许多个 `NULL`。 |
| `phone` | `VARCHAR(20)` | 否 | `NULL` | 唯一 `uq_users_phone` | 手机号；若填写必须按项目规则校验格式。 |
| `status` | `VARCHAR(16)` | 是 | `ACTIVE` | 复合索引 `idx_users_status_deleted_at` | 仅允许 `ACTIVE`（正常）或 `DISABLED`（禁用）。 |
| `last_login_at` | `DATETIME(3)` | 否 | `NULL` | — | 最后一次成功登录时间。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |
| `deleted_at` | `DATETIME(3)` | 否 | `NULL` | `idx_users_status_deleted_at` | 为后续合规/数据保留预留；第一版不提供用户删除入口。 |

### 约束与索引说明

```text
主键：pk_users (id)
唯一约束：uq_users_username (username)
唯一约束：uq_users_email (email)
唯一约束：uq_users_phone (phone)
索引：idx_users_status_deleted_at (status, deleted_at)
可选索引：idx_users_nickname (nickname)，仅后台确有昵称模糊搜索时添加
```

查询用户身份时应始终同时判断：`status = ACTIVE` 且 `deleted_at IS NULL`。

## 4. 表：`roles`

保存系统预置角色。第一版角色数量很少，应由初始化数据管理，而不是允许前台自由创建。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `TINYINT UNSIGNED` | 是 | 自增 | 主键 `pk_roles` | 角色唯一标识。 |
| `code` | `VARCHAR(32)` | 是 | — | 唯一 `uq_roles_code` | 稳定角色编码，例如 `USER`、`ADMIN`。 |
| `name` | `VARCHAR(50)` | 是 | — | 唯一 `uq_roles_name` | 管理后台显示名，例如“普通用户”“管理员”。 |
| `description` | `VARCHAR(255)` | 否 | `NULL` | — | 角色职责描述。 |
| `enabled` | `TINYINT(1)` | 是 | `1` | — | 是否可被分配；第一版预置角色不建议禁用。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

### 初始角色数据

| code | name | 用途 |
|---|---|---|
| `USER` | 普通用户 | 注册后的默认角色；可预约、下单和管理自己的数据。 |
| `ADMIN` | 管理员 | 第一版仅保留一个启用的后台运营账号；可管理内容、预约、商品、订单、普通用户和统计。 |

`GUEST` 不写入 `roles` 表，因为游客没有登录身份，也不需要数据库授权记录。

## 5. 表：`user_roles`

保存用户和角色的多对多关系。即使第一版常见情况是一人一个角色，也保留该表，避免未来新增运营人员等角色时重构用户表。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `user_id` | `BIGINT UNSIGNED` | 是 | — | 复合主键；外键 | 关联 `users.id`。 |
| `role_id` | `TINYINT UNSIGNED` | 是 | — | 复合主键；外键；索引前缀 | 关联 `roles.id`。 |
| `assigned_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 分配角色的管理员；系统注册默认分配时可为空。 |
| `assigned_at` | `DATETIME(3)` | 是 | 当前时间 | — | 角色被授予的时间。 |

### 键与关系

```text
主键：pk_user_roles (user_id, role_id)
外键：fk_user_roles_user   user_id    → users.id
外键：fk_user_roles_role   role_id    → roles.id
外键：fk_user_roles_assigner assigned_by → users.id
附加索引：idx_user_roles_role_user (role_id, user_id)
```

外键删除策略建议均为 `RESTRICT`：第一版不物理删除用户或角色，历史数据不能因删除操作被级联抹除。

## 6. 权限矩阵

“是”表示后端允许该操作；前端可隐藏按钮，但不得把前端隐藏当作权限控制。

| 操作 | 游客 | 用户（`USER`） | 管理员（`ADMIN`） | 后端规则 |
|---|---:|---:|---:|---|
| 注册、登录 | 是 | 是 | 是 | 公开接口限流并校验输入。 |
| 浏览已发布内容、搜索、查看 3D 展项、浏览商品 | 是 | 是 | 是 | 仅返回已发布、未删除、上架的数据。 |
| 查看/修改自己的昵称和联系方式 | 否 | 是 | 是 | 仅当前 `user_id` 可操作；角色不可由本人修改。 |
| 创建预约、维护购物车、创建订单、模拟支付 | 否 | 是 | 是 | 当前账号必须 `ACTIVE`；资源归属写入当前用户 ID。 |
| 查看自己的预约和订单 | 否 | 是 | 是 | 查询条件必须包含当前 `user_id`。 |
| 查看其他用户的预约和订单 | 否 | 否 | 是 | 管理员接口，并记录关键操作。 |
| 管理文物、文章、3D 展项及其回收站 | 否 | 否 | 是 | 必须校验 `ADMIN`；遵循 ADR-003。 |
| 管理商品、库存和订单状态 | 否 | 否 | 是 | 商品历史订单数据不得被删除或篡改。 |
| 管理普通用户状态 | 否 | 否 | 是 | 管理员可禁用/恢复普通用户；不得修改自己的角色。 |
| 忘记密码并重置 | 否 | 是 | 是 | 用户须验证已绑定邮箱；未绑定邮箱时由管理员人工重置。手机号不用于第一版密码找回。 |
| 查看统计与操作日志 | 否 | 否 | 是 | 返回内容不含密码摘要、令牌等敏感字段。 |

## 7. 账号与权限业务规则

### 7.1 注册

1. 公开注册只创建普通用户，服务端固定授予 `USER` 角色；客户端传入的角色字段一律忽略或拒绝。注册时邮箱和手机号均不强制填写。
2. 注册必须校验用户名唯一、密码长度/强度、昵称长度以及已填写的邮箱/手机号格式和唯一性。
3. 密码使用 BCrypt 哈希后写入 `password_hash`；日志不得记录注册密码或完整敏感请求体。
4. 新账号默认 `status = ACTIVE`、`deleted_at = NULL`。
5. 第一版不要求真实短信、邮箱验证或第三方登录；相关能力若加入，必须先更新需求与 ADR。

### 7.2 登录与退出

1. 登录仅接受账号和密码；认证成功后才返回受保护资源所需的认证结果。
2. 登录前检查 `status = ACTIVE` 且 `deleted_at IS NULL`；禁用或不存在账号均返回统一认证失败提示，避免枚举用户是否存在。
3. 成功登录更新 `last_login_at`；失败登录不得修改该字段。
4. 退出登录必须使当前认证失效；具体令牌失效策略在 API 与认证实施计划中确定。
5. 每个受保护请求均需要确认当前用户仍处于可用状态，不能仅相信旧令牌中的角色信息。

### 7.3 忘记密码与重置密码

1. 第一版提供“忘记密码”入口，用户输入用户名以及**已绑定邮箱**发起验证。
2. 注册时邮箱不强制；但未绑定邮箱的用户不能自助找回密码，只能联系管理员人工重置。手机号仅用于预约联系人，不用于第一版密码找回。
3. 验证通过后才允许设置新密码；新密码仍须按注册规则校验并使用 BCrypt 更新 `password_hash`。
4. 重置凭证必须一次性、短时有效、不可明文保存，并在使用后立即失效；具体凭证表、邮件/短信发送实现放入后续认证 API 与部署计划。
5. 管理员人工重置时，应生成一次性临时密码或重置链接，要求用户首次登录后修改密码，并写入 `operation_logs`。

### 7.4 禁用与恢复用户

1. 管理员可把普通用户从 `ACTIVE` 设为 `DISABLED`；禁用后不得登录、预约、下单或访问个人数据。
2. 禁用不删除用户、预约、订单或操作日志；历史记录继续保留。
3. 管理员恢复账号时将状态改回 `ACTIVE`，并记录操作人、时间、原因。
4. 第一版禁止管理员禁用自己，且系统必须始终保留至少一个 `ACTIVE` 的管理员账号，防止后台失去管理入口。
5. 对管理员账号的禁用、恢复、角色变更都属于高风险操作，必须写入 `operation_logs`。

### 7.5 管理员创建账号与角色规则

1. 不存在公开管理员注册入口，也不能通过普通注册参数获得 `ADMIN`。
2. 第一版只保留一个 `ACTIVE` 的管理员账号，由受控初始化数据或部署时的安全配置创建；初始密码不得写入仓库。
3. 已登录管理员可以创建普通用户账号，但第一版后台不提供“创建第二个管理员”或“授予/撤销 ADMIN 角色”的界面与接口。
4. 管理员可禁用/恢复普通用户，但不得禁用自己；系统不能出现零个可用管理员。
5. 数据模型仍保留多角色扩展能力；若将来需要多个管理员，必须先更新需求、权限矩阵和实施计划。

## 8. 内容模块数据模型

本节覆盖 F-01 至 F-05：管理员维护内容，年轻用户浏览、搜索、阅读详情并进入自创 3D 展项。下列内容仅为数据设计，不代表已创建任何数据库对象。

### 8.1 内容关系

```text
categories 1 ── N artifacts
categories 1 ── N articles
artifacts  1 ── N exhibits_3d

users 1 ── N artifacts/articles/exhibits_3d（创建、更新、删除操作人）
```

- 第一版的文物和文章均归属一个分类；同一分类可以被文物和文章共同使用。
- 一个文物可关联零个或多个 3D 展项；第一版至少完成一个已发布的自创 3D 展项。
- 3D 展项不单独选择分类，前台通过关联文物的分类组织，避免分类不一致。

### 8.2 表：`categories`

用于文物和文章的一级分类，例如“青铜器”“河洛故事”“馆藏精选”。第一版不做多级分类树。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_categories` | 分类唯一标识。 |
| `code` | `VARCHAR(32)` | 是 | — | 唯一 `uq_categories_code` | 稳定机器编码，例如 `BRONZE`、`HISTORY`。 |
| `name` | `VARCHAR(64)` | 是 | — | 唯一 `uq_categories_name` | 前台与后台显示名称。 |
| `description` | `VARCHAR(255)` | 否 | `NULL` | — | 分类简介。 |
| `sort_order` | `INT UNSIGNED` | 是 | `0` | `idx_categories_enabled_sort` | 数字越小排序越靠前。 |
| `enabled` | `TINYINT(1)` | 是 | `1` | `idx_categories_enabled_sort` | 是否可供新内容选择及前台筛选。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

约束与规则：

```text
主键：pk_categories (id)
唯一约束：uq_categories_code (code)、uq_categories_name (name)
索引：idx_categories_enabled_sort (enabled, sort_order, id)
```

- 已被文物或文章使用的分类不能物理删除；管理员只能设为 `enabled = 0`。
- 停用分类不再出现在新建/编辑内容的分类选择中；历史内容仍保留原分类，避免数据丢失。

### 8.3 表：`artifacts`

保存馆藏文物的结构化资料和面向前台展示的内容。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_artifacts` | 文物唯一标识。 |
| `category_id` | `BIGINT UNSIGNED` | 是 | — | 外键；复合索引前缀 | 关联 `categories.id`。 |
| `accession_no` | `VARCHAR(64)` | 否 | `NULL` | 唯一 `uq_artifacts_accession_no` | 馆藏编号；若课程资料未提供可为空。 |
| `title` | `VARCHAR(150)` | 是 | — | 搜索索引 | 文物名称。 |
| `slug` | `VARCHAR(180)` | 是 | — | 唯一 `uq_artifacts_slug` | 稳定 URL 标识，建议英文/拼音短横线格式。 |
| `period` | `VARCHAR(100)` | 否 | `NULL` | `idx_artifacts_period` | 年代或时期，例如“商代晚期”。 |
| `material` | `VARCHAR(100)` | 否 | `NULL` | — | 材质，例如“青铜”。 |
| `dimensions` | `VARCHAR(150)` | 否 | `NULL` | — | 尺寸描述。 |
| `collection_location` | `VARCHAR(150)` | 否 | `NULL` | — | 馆藏地点或展厅位置。 |
| `cover_image_url` | `VARCHAR(500)` | 否 | `NULL` | — | 面向前台的自创封面图片访问路径。 |
| `cover_asset_ref` | `VARCHAR(128)` | 否 | `NULL` | `idx_artifacts_cover_asset_ref` | 图片资产逻辑编号，关联项目资产清单而非第三方来源。 |
| `summary` | `VARCHAR(500)` | 否 | `NULL` | 搜索索引 | 列表卡片与搜索结果摘要。 |
| `content` | `LONGTEXT` | 是 | — | — | 文物详情正文、故事和背景资料。 |
| `status` | `VARCHAR(16)` | 是 | `DRAFT` | 可见性复合索引 | 仅允许 `DRAFT`、`PUBLISHED`、`WITHDRAWN`。 |
| `published_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | 首次或当前发布到前台的时间。 |
| `created_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 创建该记录的管理员。 |
| `updated_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 最后更新该记录的管理员。 |
| `deleted_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | ADR-003 软删除时间。 |
| `deleted_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 执行软删除的管理员。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

索引与关系：

```text
主键：pk_artifacts (id)
外键：category_id → categories.id
外键：created_by / updated_by / deleted_by → users.id
唯一约束：uq_artifacts_slug (slug)、uq_artifacts_accession_no (accession_no)
索引：idx_artifacts_visibility (status, deleted_at, published_at, id)
索引：idx_artifacts_category_visibility (category_id, status, deleted_at, published_at, id)
索引：idx_artifacts_period (period)
```

### 8.4 表：`articles`

保存面向年轻文化探索者的故事化文章、专题内容和资讯。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_articles` | 文章唯一标识。 |
| `category_id` | `BIGINT UNSIGNED` | 是 | — | 外键；复合索引前缀 | 关联 `categories.id`。 |
| `title` | `VARCHAR(200)` | 是 | — | 搜索索引 | 文章标题。 |
| `slug` | `VARCHAR(220)` | 是 | — | 唯一 `uq_articles_slug` | 稳定 URL 标识。 |
| `cover_image_url` | `VARCHAR(500)` | 否 | `NULL` | — | 前台封面图片访问路径。 |
| `cover_asset_ref` | `VARCHAR(128)` | 否 | `NULL` | `idx_articles_cover_asset_ref` | 自创封面图片的资产逻辑编号。 |
| `summary` | `VARCHAR(500)` | 是 | — | 搜索索引 | 首页、列表和搜索结果使用的摘要。 |
| `content` | `LONGTEXT` | 是 | — | — | 文章正文。 |
| `author_display` | `VARCHAR(100)` | 否 | `NULL` | — | 面向前台显示的作者或栏目名称，不等同于后台管理员账号。 |
| `status` | `VARCHAR(16)` | 是 | `DRAFT` | 可见性复合索引 | 仅允许 `DRAFT`、`PUBLISHED`、`WITHDRAWN`。 |
| `published_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | 发布到前台的时间。 |
| `created_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 创建记录的管理员。 |
| `updated_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 最后更新记录的管理员。 |
| `deleted_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | ADR-003 软删除时间。 |
| `deleted_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 执行软删除的管理员。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

索引与关系：

```text
主键：pk_articles (id)
外键：category_id → categories.id
外键：created_by / updated_by / deleted_by → users.id
唯一约束：uq_articles_slug (slug)
索引：idx_articles_visibility (status, deleted_at, published_at, id)
索引：idx_articles_category_visibility (category_id, status, deleted_at, published_at, id)
```

### 8.5 表：`exhibits_3d`

保存与文物关联的自创 3D 展项。模型源文件和导出文件必须保留，但源文件不得作为前台公开下载资源。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_exhibits_3d` | 3D 展项唯一标识。 |
| `artifact_id` | `BIGINT UNSIGNED` | 是 | — | 外键；复合索引前缀 | 关联 `artifacts.id`。 |
| `title` | `VARCHAR(150)` | 是 | — | — | 展项显示名称。 |
| `slug` | `VARCHAR(180)` | 是 | — | 唯一 `uq_exhibits_3d_slug` | 稳定 URL 标识。 |
| `summary` | `VARCHAR(500)` | 否 | `NULL` | — | 列表或入口摘要。 |
| `description` | `LONGTEXT` | 否 | `NULL` | — | 展项说明和交互引导。 |
| `model_url` | `VARCHAR(500)` | 是 | — | — | 面向 Web 加载的 GLB/GLTF 导出模型路径。 |
| `model_source_ref` | `VARCHAR(128)` | 是 | — | 唯一 `uq_exhibits_3d_model_source_ref` | 自创模型源文件的资产逻辑编号，不向前台返回真实存储路径。 |
| `model_format` | `VARCHAR(16)` | 是 | `GLB` | — | 第一版仅允许 `GLB` 或 `GLTF`。 |
| `model_size_bytes` | `BIGINT UNSIGNED` | 是 | — | — | 导出模型文件大小，用于加载性能检查。 |
| `mobile_model_url` | `VARCHAR(500)` | 否 | `NULL` | — | 面向受限性能档或移动设备的可选 GLB/GLTF 路径；为空时客户端回退 `model_url`。 |
| `mobile_model_size_bytes` | `BIGINT UNSIGNED` | 否 | `NULL` | — | 移动模型文件大小；与 `mobile_model_url` 同时填写或同时留空。 |
| `cover_image_url` | `VARCHAR(500)` | 否 | `NULL` | — | 自创封面图访问路径。 |
| `cover_asset_ref` | `VARCHAR(128)` | 否 | `NULL` | `idx_exhibits_3d_cover_asset_ref` | 自创封面图片资产逻辑编号。 |
| `status` | `VARCHAR(16)` | 是 | `DRAFT` | 可见性复合索引 | 仅允许 `DRAFT`、`PUBLISHED`、`WITHDRAWN`。 |
| `published_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | 发布到前台的时间。 |
| `created_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 创建该展项的管理员。 |
| `updated_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 最后更新该展项的管理员。 |
| `deleted_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | ADR-003 软删除时间。 |
| `deleted_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 执行软删除的管理员。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

索引与关系：

```text
主键：pk_exhibits_3d (id)
外键：artifact_id → artifacts.id
外键：created_by / updated_by / deleted_by → users.id
唯一约束：uq_exhibits_3d_slug (slug)、uq_exhibits_3d_model_source_ref (model_source_ref)
索引：idx_exhibits_3d_visibility (status, deleted_at, published_at, id)
索引：idx_exhibits_3d_artifact_visibility (artifact_id, status, deleted_at, published_at, id)
```

`mobile_model_url` 与 `mobile_model_size_bytes` 是应用层成对字段：管理端创建或编辑展项时，只填写其中一个会被拒绝；提供大小时必须为正整数。`V23` 为 `heluo-bronze-ding-3d` 回填 `/media/models/heluo-bronze-ding-v5.5-mobile.glb` 与 `837720` 字节，其他既有展项保持两个字段均为 `NULL`。

### 8.6 发布、撤回与软删除规则

文物、文章、3D 展项均遵循同一生命周期：

```text
新建 → DRAFT（草稿）
DRAFT / WITHDRAWN → PUBLISHED（已发布）
PUBLISHED → WITHDRAWN（已撤回）
任意未物理删除记录 → 软删除（deleted_at、deleted_by 有值）
软删除 → 恢复为 WITHDRAWN → 管理员再次发布
```

| 行为 | 管理员后台 | 游客前台 |
|---|---|---|
| 草稿 | 可查看、编辑、发布 | 不可见。 |
| 已发布 | 可编辑、撤回、软删除 | 可在列表、搜索、详情和 3D 展厅中查看。 |
| 已撤回 | 可编辑、再次发布、软删除 | 不可见；原详情链接显示“不存在或已下架”。 |
| 已软删除 | 可在回收站查看、恢复 | 不可见，也不得出现在搜索或统计公开数据中。 |

所有前台内容查询都必须等价于：

```text
status = PUBLISHED
AND deleted_at IS NULL
AND published_at <= 当前时间
```

恢复 3D 展项时，其关联文物必须未软删除；如果关联文物已撤回或未发布，3D 展项即使自身已发布也不应在前台独立入口展示。

### 8.7 自创图片与 3D 模型的记录方式

为符合 A-01、A-02，数据库只保存面向页面使用的路径和资产逻辑编号；资产源文件和制作说明由项目资产清单保存，不以“网上图片/模型链接”替代。

| 资产类型 | 数据表字段 | 记录要求 |
|---|---|---|
| 文物封面图 | `artifacts.cover_image_url`、`cover_asset_ref` | 使用自创 Web 导出图；`cover_asset_ref` 能追溯到原始或可编辑源文件、制作人、用途和许可说明。 |
| 文章封面图 | `articles.cover_image_url`、`cover_asset_ref` | 同上；文章正文内额外图片应在内容编辑规则中登记资产编号。 |
| 3D 模型 | `exhibits_3d.model_url`、`model_source_ref`、`model_format`、`model_size_bytes`、`mobile_model_url`、`mobile_model_size_bytes` | `model_url` 是默认模型；可选移动模型字段成对记录移动 LOD 路径和大小。`model_source_ref` 指向自创建模源文件与资产说明，源文件不公开。 |
| 3D 封面图 | `exhibits_3d.cover_image_url`、`cover_asset_ref` | 使用自创渲染图或自创摄影图。 |

第一版采用“资产逻辑编号 + 项目资产清单”方式，不额外新建 `assets` 数据表。若后续一件内容需要多张图片、视频、多个模型版本或复杂授权信息，再设计独立媒体资源表。

### 8.8 内容权限边界

| 操作 | 游客 | 用户（`USER`） | 管理员（`ADMIN`） | 规则 |
|---|---:|---:|---:|---|
| 浏览分类、已发布文物/文章、公开 3D 展项 | 是 | 是 | 是 | 只返回已启用分类、已发布且未软删除的数据。 |
| 搜索公开内容 | 是 | 是 | 是 | 搜索范围与公开浏览范围完全一致。 |
| 查看草稿、撤回、回收站内容 | 否 | 否 | 是 | 后端校验 `ADMIN`，不得通过前端隐藏按钮代替。 |
| 新建、编辑、发布、撤回内容/展项 | 否 | 否 | 是 | 记录 `created_by`、`updated_by` 和关键操作日志。 |
| 软删除、恢复内容/展项 | 否 | 否 | 是 | 遵循 ADR-003；恢复后统一为 `WITHDRAWN`。 |
| 管理分类 | 否 | 否 | 是 | 已被引用的分类只能停用，不能物理删除。 |

### 8.9 已确认的内容模块设计决策

1. [已确认] 第一版只使用一级分类，不做多级分类树。
2. [已确认] 文物和文章第一版各使用一张自创封面图，不做多图片画廊；后续需要多图时新增独立媒体表。
3. [已确认] 第一版搜索只做标题和摘要的简单匹配，不配置 MySQL 中文全文检索。
4. [已确认] 一个文物允许关联多个 3D 展项；第一版至少制作并发布一个自创模型。
5. [已确认] 第一版不设内容审核人和“待审核”状态；唯一管理员可直接发布内容。
6. [已确认] 图片与模型资产清单使用项目内 Markdown/表格维护；实际资产创作开始时再确定目录、命名和清单格式。
## 9. 预约模块数据模型与状态机

本节覆盖 F-06、F-07：已登录用户在线预约线下参观，管理员配置可预约时段并确认、取消或完成预约。预约是历史业务记录，**不提供删除或软删除**；取消通过状态保留完整历史。

### 9.1 预约关系与基本规则

```text
users 1 ── N appointments
appointment_slots 1 ── N appointments
users 1 ── N appointment_slots（创建/更新时段的管理员）
users 1 ── N appointments（最后修改预约状态的操作人）
```

- 一个用户可拥有多个预约；同一用户在同一个预约时段只允许有一个“待确认或已确认”的有效预约。
- 一个预约时段可容纳多笔预约；每笔预约记录实际到访人数。
- 预约时必须保存联系人姓名、手机号和邮箱快照，不能只依赖用户资料中的可选联系方式。
- 第一版需要管理员处理预约，因此新提交预约默认进入 `PENDING`（待确认），而不是自动确认。

### 9.2 表：`appointment_slots`

管理员配置可供用户预约的参观日期与时间段；它决定容量和是否可预约。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_appointment_slots` | 时段唯一标识。 |
| `visit_date` | `DATE` | 是 | — | 唯一组合；查询索引前缀 | 参观日期。 |
| `start_time` | `TIME` | 是 | — | 唯一组合；查询索引前缀 | 时段开始时间。 |
| `end_time` | `TIME` | 是 | — | 唯一组合 | 时段结束时间，必须晚于开始时间。 |
| `capacity` | `SMALLINT UNSIGNED` | 是 | — | — | 该时段最多允许的总到访人数，必须大于 0。 |
| `reserved_people` | `SMALLINT UNSIGNED` | 是 | `0` | — | 已占用人数，统计 `PENDING` 与 `CONFIRMED` 预约；创建/取消需原子更新。 |
| `status` | `VARCHAR(16)` | 是 | `OPEN` | 查询索引前缀 | 仅允许 `OPEN`（可预约）、`CLOSED`（停止新预约）、`CANCELLED`（时段取消）。 |
| `created_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 创建时段的管理员。 |
| `updated_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 最后修改时段的管理员。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

键、索引与约束：

```text
主键：pk_appointment_slots (id)
唯一约束：uq_appointment_slots_time (visit_date, start_time, end_time)
索引：idx_appointment_slots_browse (visit_date, status, start_time, id)
外键：created_by / updated_by → users.id
```

- 管理员不能把容量调低到小于 `reserved_people`。
- 已有有效预约的时段不能物理删除；管理员只能设为 `CLOSED` 或 `CANCELLED`。
- `CANCELLED` 时段的有效预约需要由管理员逐笔取消并通知；第一版只记录处理结果，不承诺短信通知。
- `FULL` 不作为持久状态：当前台展示时，按 `reserved_people >= capacity` 计算“已约满”。

### 9.3 表：`appointments`

保存用户提交的预约和全部状态流转记录的当前结果。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_appointments` | 预约唯一标识。 |
| `appointment_no` | `VARCHAR(32)` | 是 | — | 唯一 `uq_appointments_no` | 面向用户展示的预约编号。 |
| `user_id` | `BIGINT UNSIGNED` | 是 | — | 外键；复合索引前缀 | 提交预约的当前用户。 |
| `slot_id` | `BIGINT UNSIGNED` | 是 | — | 外键；复合索引前缀 | 关联 `appointment_slots.id`。 |
| `visitor_count` | `SMALLINT UNSIGNED` | 是 | `1` | — | 到访人数，必须大于 0 且不超过时段剩余容量。 |
| `contact_name` | `VARCHAR(50)` | 是 | — | — | 预约联系人姓名快照。 |
| `contact_phone` | `VARCHAR(20)` | 是 | — | `idx_appointments_contact_phone` | 预约联系人手机号快照，服务端校验格式。 |
| `contact_email` | `VARCHAR(254)` | 是 | — | `idx_appointments_contact_email` | 预约确认/取消邮件接收地址；保存预约时的邮箱快照并校验格式。 |
| `notes` | `VARCHAR(500)` | 否 | `NULL` | — | 用户备注；不得储存身份证、银行卡等非必要敏感信息。 |
| `status` | `VARCHAR(16)` | 是 | `PENDING` | 复合索引前缀 | 仅允许 `PENDING`、`CONFIRMED`、`CANCELLED`、`COMPLETED`。 |
| `cancel_reason` | `VARCHAR(255)` | 否 | `NULL` | — | 用户或管理员取消时记录原因。 |
| `status_updated_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 最后更新状态的用户或管理员；系统任务可为空。 |
| `status_updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最近一次状态变更时间。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建预约时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

键、索引与约束：

```text
主键：pk_appointments (id)
唯一约束：uq_appointments_no (appointment_no)
外键：user_id → users.id
外键：slot_id → appointment_slots.id
外键：status_updated_by → users.id
索引：idx_appointments_user_status_time (user_id, status, created_at, id)
索引：idx_appointments_slot_status (slot_id, status, id)
索引：idx_appointments_status_time (status, created_at, id)
索引：idx_appointments_contact_phone (contact_phone)
索引：idx_appointments_contact_email (contact_email)
```

同一用户、同一时段的重复有效预约不能只依赖普通唯一索引实现，因为 MySQL 没有直接的部分唯一索引；后端创建预约时必须在事务中检查并阻止重复的 `PENDING` / `CONFIRMED` 记录。

### 9.4 预约状态机

```text
用户提交
  → PENDING（待确认）

PENDING
  ├─ 管理员确认 → CONFIRMED（已确认）
  └─ 用户/管理员取消 → CANCELLED（已取消）

CONFIRMED
  ├─ 用户/管理员在允许时间内取消 → CANCELLED（已取消）
  └─ 管理员在参观结束后标记 → COMPLETED（已完成）

CANCELLED / COMPLETED 为终态，不允许重新打开。
```

| 当前状态 | 允许操作人 | 可变更为 | 规则 |
|---|---|---|---|
| `PENDING` | 管理员 | `CONFIRMED`、`CANCELLED` | 确认前再次检查时段开放状态与剩余容量。 |
| `PENDING` | 用户本人 | `CANCELLED` | 仅能取消自己的预约。 |
| `CONFIRMED` | 管理员 | `CANCELLED`、`COMPLETED` | 取消应填写原因；完成仅能在参观时段结束后标记。 |
| `CONFIRMED` | 用户本人 | `CANCELLED` | 仅在预约开始前的取消截止时间内允许。 |
| `CANCELLED` | 无 | — | 终态；保留历史和取消原因。 |
| `COMPLETED` | 无 | — | 终态；保留到访记录。 |

容量规则：

```text
创建 PENDING 预约：reserved_people += visitor_count
取消 PENDING/CONFIRMED：reserved_people -= visitor_count
确认 PENDING：reserved_people 不变（名额已在待确认时占用）
完成 CONFIRMED：reserved_people 不变（时段已结束，仅保留统计）
```

创建、确认、取消都需要保证 `0 <= reserved_people <= capacity`，后续实现必须使用数据库事务或等价的并发控制，防止超额预约。

### 9.5 预约权限与隐私边界

| 操作 | 游客 | 用户（`USER`） | 管理员（`ADMIN`） | 规则 |
|---|---:|---:|---:|---|
| 浏览可预约日期与时段 | 是 | 是 | 是 | 仅返回未来、`OPEN` 且未约满时段。 |
| 创建预约 | 否 | 是 | 是 | 用户账号须为 `ACTIVE`；联系人姓名、手机号、邮箱、人数、时段必填。 |
| 查看自己的预约 | 否 | 是 | 是 | 用户查询必须附加当前 `user_id`；不返回其他用户信息。 |
| 取消自己的预约 | 否 | 是 | 是 | 只能取消自己的 `PENDING` / `CONFIRMED` 预约，且遵循取消截止时间。 |
| 查看所有预约与联系人信息 | 否 | 否 | 是 | 后台按日期、时段、状态筛选；联系人手机号仅供运营使用。 |
| 管理时段、确认/取消/完成预约 | 否 | 否 | 是 | 每次状态操作写入 `status_updated_by` 和 `operation_logs`。 |

联系人姓名、手机号和邮箱属于个人信息：前端页面、日志、错误消息和统计页面均不得不必要地完整展示或长期保存；后台列表应按角色最小化展示。

### 9.6 与已确认需求的一致性

| 依据 | 本文落实方式 |
|---|---|
| F-06 | 登录用户可创建预约、查看自己的预约；联系人姓名、手机号和邮箱必填，状态初始为 `PENDING`。管理员确认或取消后发送预约状态邮件。 |
| F-07 | 管理员可处理预约状态，且状态变更有操作人与时间记录。 |
| F-08 / N-01 | 所有预约通过当前登录用户归属校验；游客不能创建预约，管理员才可查看全部预约。 |
| N-02 | 校验日期、人数、手机号与状态流转；不在普通日志或公开接口暴露联系人信息。 |
| 用户故事流程 A | 用户在内容或 3D 展项感兴趣后登录、提交预约、在“我的预约”查看状态。 |

### 9.7 已确认的预约规则与后续技术项

1. [已确认] 默认每个时段容量 **30 人**、时段长度 **2 小时**、开放未来 **14 天**预约；管理员可以按日期和活动实际情况调整，不把这三个数写死在代码中。
2. [已确认] 用户最晚可在预约开始前 **2 小时**取消；超过截止时间由管理员视实际情况处理。
3. [已确认] 管理员确认或取消预约后，系统发送邮件通知到 `contact_email`。创建预约后可显示“提交成功、等待确认”，不把它当作已确认通知。
4. [已确认] 同一用户同一天允许预约不同的时段；但同一时段只允许有一笔 `PENDING` 或 `CONFIRMED` 的有效预约。
5. [已确认] 第一版不做二维码签到；管理员在参观结束后手动将 `CONFIRMED` 标记为 `COMPLETED`。
6. [待后续设计] 邮件采用安全 SMTP 配置；发送失败不得回滚已成功的预约状态变更，需记录投递结果并支持管理员查看。
## 10. 商城、订单与模拟支付数据模型

本节覆盖 F-09、F-10、F-11：用户浏览自创文创商品、维护购物车、创建订单并完成模拟支付；管理员管理商品、库存和订单。第一版不接入真实支付平台，也不处理真实资金。

### 10.1 商城关系与基础规则

```text
users 1 ── 1 carts
carts 1 ── N cart_items
products 1 ── N cart_items

users 1 ── N orders
orders 1 ── N order_items
products 1 ── N order_items（保存下单时商品快照）
orders 1 ── N payment_transactions（第一版通常只有一笔成功模拟支付）
```

- 用户只能拥有一个活动购物车；购物车中同一商品只保留一条记录，以数量累加。
- 创建订单时把商品名称、单价、封面等写入 `order_items` 快照，并将通知邮箱写入 `orders.notification_email`；后续商品改名、下架或软删除不影响历史订单。
- 商品库存采用“可用库存 + 锁定库存”模型：创建待支付订单锁定库存，支付成功正式扣减，取消/过期释放锁定库存。
- 模拟支付必须基于订单状态与幂等键处理；同一个支付请求不得重复扣库存或重复生成支付成功记录。

### 10.2 表：`products`

保存管理员维护的文创商品。商品删除遵循 ADR-003：有历史订单的商品不能物理删除。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_products` | 商品唯一标识。 |
| `sku` | `VARCHAR(64)` | 是 | — | 唯一 `uq_products_sku` | 商品库存编码。 |
| `name` | `VARCHAR(150)` | 是 | — | 搜索索引 | 商品名称。 |
| `slug` | `VARCHAR(180)` | 是 | — | 唯一 `uq_products_slug` | 稳定 URL 标识。 |
| `summary` | `VARCHAR(500)` | 否 | `NULL` | 搜索索引 | 商品列表摘要与文化故事简述。 |
| `description` | `LONGTEXT` | 否 | `NULL` | — | 商品详情、设计故事和材质说明。 |
| `price` | `DECIMAL(10,2)` | 是 | — | — | 当前销售单价，必须大于 0。 |
| `stock_quantity` | `INT UNSIGNED` | 是 | `0` | — | 实际可售总库存，支付成功时扣减。 |
| `locked_stock` | `INT UNSIGNED` | 是 | `0` | — | 待支付订单占用的库存；不得大于 `stock_quantity`。 |
| `cover_image_url` | `VARCHAR(500)` | 否 | `NULL` | — | 自创商品封面图访问路径。 |
| `cover_asset_ref` | `VARCHAR(128)` | 否 | `NULL` | `idx_products_cover_asset_ref` | 对应自创图片资产逻辑编号。 |
| `status` | `VARCHAR(16)` | 是 | `ON_SHELF` | 可见性复合索引 | 仅允许 `ON_SHELF`、`OFF_SHELF`。 |
| `created_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 创建商品的管理员。 |
| `updated_by` | `BIGINT UNSIGNED` | 是 | — | 外键 | 最后更新商品的管理员。 |
| `deleted_at` | `DATETIME(3)` | 否 | `NULL` | 可见性复合索引 | ADR-003 软删除时间。 |
| `deleted_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 执行软删除的管理员。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

键、索引与规则：

```text
主键：pk_products (id)
唯一约束：uq_products_sku (sku)、uq_products_slug (slug)
外键：created_by / updated_by / deleted_by → users.id
索引：idx_products_visibility (status, deleted_at, id)
索引：idx_products_cover_asset_ref (cover_asset_ref)
```

- 前台只能浏览 `ON_SHELF` 且 `deleted_at IS NULL` 的商品。
- 有 `PENDING_PAYMENT`、`PAID` 或 `COMPLETED` 历史订单的商品不得物理删除；管理员应先下架。
- 管理员不能把 `stock_quantity` 调低至小于 `locked_stock`。

### 10.3 表：`carts`

每个已登录用户一个活动购物车。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_carts` | 购物车唯一标识。 |
| `user_id` | `BIGINT UNSIGNED` | 是 | — | 唯一 `uq_carts_user_id`；外键 | 购物车所属用户。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

```text
主键：pk_carts (id)
唯一约束：uq_carts_user_id (user_id)
外键：user_id → users.id
```

游客购物车不做持久化；第一版要求登录后才能加入购物车。

### 10.4 表：`cart_items`

保存用户计划购买的商品与数量；购物车价格只做展示，下单时必须重新读取商品当前价格、状态和库存。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_cart_items` | 购物车项唯一标识。 |
| `cart_id` | `BIGINT UNSIGNED` | 是 | — | 外键；唯一组合前缀 | 关联 `carts.id`。 |
| `product_id` | `BIGINT UNSIGNED` | 是 | — | 外键；唯一组合后缀 | 关联 `products.id`。 |
| `quantity` | `INT UNSIGNED` | 是 | `1` | — | 加购数量，必须大于 0。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 加入时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

```text
主键：pk_cart_items (id)
唯一约束：uq_cart_items_cart_product (cart_id, product_id)
外键：cart_id → carts.id
外键：product_id → products.id
索引：idx_cart_items_product (product_id, id)
```

商品下架、软删除、库存不足或数量无效时，不能继续结算；前端应提示并允许用户移除失效购物车项。

### 10.5 表：`orders`

保存用户订单及其当前业务状态。第一版为模拟支付订单，不记录真实支付凭据。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_orders` | 订单唯一标识。 |
| `order_no` | `VARCHAR(32)` | 是 | — | 唯一 `uq_orders_no` | 面向用户展示的订单编号。 |
| `user_id` | `BIGINT UNSIGNED` | 是 | — | 外键；复合索引前缀 | 下单用户。 |
| `total_amount` | `DECIMAL(10,2)` | 是 | — | — | 下单时所有明细小计之和。 |
| `payable_amount` | `DECIMAL(10,2)` | 是 | — | — | 第一版等于 `total_amount`；预留未来优惠扩展。 |
| `status` | `VARCHAR(20)` | 是 | `PENDING_PAYMENT` | 复合索引前缀 | 仅允许 `PENDING_PAYMENT`、`PAID`、`CANCELLED`、`COMPLETED`。 |
| `payment_method` | `VARCHAR(16)` | 是 | `MOCK` | — | 第一版固定 `MOCK`，不得伪装为真实支付方式。 |
| `notification_email` | `VARCHAR(254)` | 是 | — | `idx_orders_notification_email` | 支付状态邮件接收地址快照；结算时必填并校验格式。 |
| `expires_at` | `DATETIME(3)` | 是 | — | `idx_orders_expiry` | 支付截止时间；超时后由系统取消订单并释放库存。 |
| `paid_at` | `DATETIME(3)` | 否 | `NULL` | — | 模拟支付成功时间。 |
| `cancelled_at` | `DATETIME(3)` | 否 | `NULL` | — | 取消或支付超时的时间。 |
| `completed_at` | `DATETIME(3)` | 否 | `NULL` | — | 管理员确认订单完成的时间。 |
| `cancel_reason` | `VARCHAR(255)` | 否 | `NULL` | — | 用户取消、库存异常或超时取消原因。 |
| `status_updated_by` | `BIGINT UNSIGNED` | 否 | `NULL` | 外键 | 最后变更订单状态的用户、管理员或系统；系统可为空。 |
| `status_updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最近状态变更时间。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 下单时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后修改时间。 |

```text
主键：pk_orders (id)
唯一约束：uq_orders_no (order_no)
外键：user_id → users.id
外键：status_updated_by → users.id
索引：idx_orders_user_status_time (user_id, status, created_at, id)
索引：idx_orders_status_time (status, created_at, id)
索引：idx_orders_expiry (status, expires_at, id)
索引：idx_orders_notification_email (notification_email)
```

### 10.6 表：`order_items`

保存下单时的商品快照，确保历史订单不被后续商品修改影响。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_order_items` | 订单明细唯一标识。 |
| `order_id` | `BIGINT UNSIGNED` | 是 | — | 外键；索引前缀 | 关联 `orders.id`。 |
| `product_id` | `BIGINT UNSIGNED` | 是 | — | 外键；索引 | 原商品关联，商品软删除后仍保留。 |
| `product_sku_snapshot` | `VARCHAR(64)` | 是 | — | — | 下单时 SKU 快照。 |
| `product_name_snapshot` | `VARCHAR(150)` | 是 | — | — | 下单时名称快照。 |
| `product_cover_url_snapshot` | `VARCHAR(500)` | 否 | `NULL` | — | 下单时封面图路径快照。 |
| `unit_price` | `DECIMAL(10,2)` | 是 | — | — | 下单时单价快照。 |
| `quantity` | `INT UNSIGNED` | 是 | — | — | 下单数量，必须大于 0。 |
| `subtotal_amount` | `DECIMAL(10,2)` | 是 | — | — | `unit_price × quantity` 的服务端计算结果。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 创建时间。 |

```text
主键：pk_order_items (id)
外键：order_id → orders.id
外键：product_id → products.id
索引：idx_order_items_order (order_id, id)
索引：idx_order_items_product (product_id, id)
```

### 10.7 表：`payment_transactions`

用于模拟支付的幂等记录。额外设计此表是为了满足 F-10 的“重复请求不重复扣库存/改变金额”。

| 字段 | MySQL 类型 | 必填 | 默认值 | 约束/索引 | 说明 |
|---|---|---:|---|---|---|
| `id` | `BIGINT UNSIGNED` | 是 | 自增 | 主键 `pk_payment_transactions` | 支付记录唯一标识。 |
| `payment_no` | `VARCHAR(32)` | 是 | — | 唯一 `uq_payment_transactions_no` | 模拟支付流水号。 |
| `order_id` | `BIGINT UNSIGNED` | 是 | — | 外键；索引 | 关联订单。 |
| `idempotency_key` | `VARCHAR(64)` | 是 | — | 唯一 `uq_payment_transactions_idempotency_key` | 同一支付请求重试时使用的幂等键。 |
| `amount` | `DECIMAL(10,2)` | 是 | — | — | 必须等于订单的 `payable_amount`。 |
| `method` | `VARCHAR(16)` | 是 | `MOCK` | — | 固定为 `MOCK`。 |
| `status` | `VARCHAR(16)` | 是 | `INITIATED` | 索引前缀 | 仅允许 `INITIATED`、`SUCCEEDED`、`FAILED`。 |
| `paid_at` | `DATETIME(3)` | 否 | `NULL` | — | 成功时间。 |
| `created_at` | `DATETIME(3)` | 是 | 当前时间 | — | 发起时间。 |
| `updated_at` | `DATETIME(3)` | 是 | 当前时间 | — | 最后更新时间。 |

```text
主键：pk_payment_transactions (id)
唯一约束：uq_payment_transactions_no (payment_no)
唯一约束：uq_payment_transactions_idempotency_key (idempotency_key)
外键：order_id → orders.id
索引：idx_payment_transactions_order_status (order_id, status, id)
```

### 10.8 商品、订单与支付状态机

商品状态：

```text
ON_SHELF（上架） ↔ OFF_SHELF（下架）
任一未物理删除商品 → 软删除（deleted_at、deleted_by 有值）
```

订单状态：

```text
创建订单 → PENDING_PAYMENT（待支付）
PENDING_PAYMENT → PAID（模拟支付成功）
PENDING_PAYMENT → CANCELLED（用户取消 / 支付超时 / 管理员取消）
PAID → COMPLETED（管理员确认订单完成）
CANCELLED / COMPLETED 为终态
```

库存与支付规则：

| 事件 | `stock_quantity` | `locked_stock` | 订单状态 |
|---|---:|---:|---|
| 创建待支付订单 | 不变 | 增加订单数量 | `PENDING_PAYMENT` |
| 模拟支付成功 | 减少订单数量 | 减少订单数量 | `PAID` |
| 用户取消/超时取消 | 不变 | 减少订单数量 | `CANCELLED` |
| 管理员完成订单 | 不变 | 不变 | `COMPLETED` |

支付处理顺序：

```text
验证当前用户拥有该待支付订单
→ 验证订单未超时、金额未变化
→ 以 idempotency_key 查询已有支付结果
→ 锁定订单和商品库存
→ 创建/更新模拟支付记录为 SUCCEEDED
→ 订单变为 PAID，更新库存与锁定库存
→ 向 notification_email 发送模拟支付成功邮件；投递失败不回滚支付结果
→ 重复请求返回同一支付结果，不再扣减库存
```

### 10.9 商城权限边界

| 操作 | 游客 | 用户（`USER`） | 管理员（`ADMIN`） | 规则 |
|---|---:|---:|---:|---|
| 浏览上架商品与详情 | 是 | 是 | 是 | 仅返回 `ON_SHELF`、未软删除商品。 |
| 加入/修改购物车 | 否 | 是 | 是 | 用户只能维护自己的购物车；下架商品不可新增。 |
| 创建订单、取消待支付订单、模拟支付 | 否 | 是 | 是 | 用户只能处理自己的订单；结算时须填写通知邮箱；服务端重新校验库存、价格、状态。 |
| 查看自己的订单和明细 | 否 | 是 | 是 | 查询必须带当前 `user_id`。 |
| 查看全部订单、标记订单完成 | 否 | 否 | 是 | 管理员可筛选订单，但不可篡改历史商品快照或支付金额。 |
| 管理商品、上下架、库存、回收站 | 否 | 否 | 是 | 有历史订单商品先下架，遵循 ADR-003。 |

### 10.10 自创商品图片与历史记录

- `products.cover_image_url` 与 `cover_asset_ref` 只引用项目组自主创作的商品图片；资产清单按已确认的项目内 Markdown/表格方式维护。
- 创建订单后，将展示图路径写入 `order_items.product_cover_url_snapshot`；商品改图、下架或软删除不改变历史订单明细。
- 第一版每件商品使用一张封面图；如未来增加多图、规格、颜色或尺寸，再设计独立商品媒体/规格表。

### 10.11 已确认的商城规则与后续技术项

1. [已确认] 待支付订单在 **30 分钟**后自动取消，并释放锁定库存。
2. [已确认] 单笔订单中，同一商品最多购买 **10 件**；服务端在加入购物车和创建订单时都校验该上限。
3. [已确认] 第一版不做收货地址、快递和真实物流；订单只演示商品购买、模拟支付和管理员手动完成。
4. [已确认] 模拟支付成功后向 `orders.notification_email` 发送状态邮件；结算时通知邮箱必填，保存为订单快照。
5. [已确认] 管理员手动将 `PAID` 订单标为 `COMPLETED`。
6. [已确认] 购物车商品价格变化时，结算以当前上架商品价格为准；页面必须在创建订单前展示最终金额。
7. [待后续设计] 邮件使用安全 SMTP 配置；投递失败必须可查询或重试，但不得回滚已经成功的模拟支付。
## 11. 与已确认决策的一致性

| 依据 | 本文落实方式 |
|---|---|
| ADR-001：Vue 3、Spring Boot 3、MySQL | 数据类型、主键、外键与索引按 MySQL 8 设计；前后端通过 API 访问，前端不直连数据库。 |
| ADR-003：内容与商品软删除 | 用户不使用物理删除；内容/商品的软删除和回收站规则保留在本文件，后续表设计会增加相应字段。 |
| F-08、N-01、N-02 | 注册默认 `USER`、服务端授权、BCrypt 密码摘要、账号状态检查、统一认证失败信息。 |
| F-04、F-06、F-07、F-10、F-11 | 预约、订单、内容和后台管理均将通过 `users.id` 关联并执行归属或 `ADMIN` 权限校验。 |

## 12. 账号模块待确认问题

以下问题不阻塞文档设计，但在建表和接口设计前应确认：

1. [已确认] 注册时邮箱和手机号均不强制；预约时联系人姓名和手机号必填。
2. [已确认] 第一版只支持 `username + password` 登录。
3. [已确认] 第一版提供忘记密码功能；自助重置仅依赖已绑定邮箱，未绑定邮箱时由管理员人工重置。手机号不用于第一版密码找回。
4. [已确认] 第一版仅保留一个启用的管理员账号，不提供创建或授予第二个管理员的功能。
5. [已确认] 第一版不提供用户自行注销/删除账号。
6. [待后续设计] 忘记密码使用邮箱验证；需在认证 API 与部署计划中确定安全的 SMTP/邮件发送配置及开发环境测试方式。

- 字段、索引与状态机的完整定义见 [`07-er-diagram.md`](07-er-diagram.md) 的关系图与核对清单。

## 13. 后续设计顺序

1. 确认商城模块待确认问题，并依据本文件绘制完整 ER 图。
2. 细化 REST API 契约、请求校验和错误码。
3. 编写“工程脚手架”实施计划。
4. 用户确认后创建 Vue、Spring Boot、Docker Compose 工程。












### 3.4 实现辅助表：`auth_sessions`

为落实 API 契约中的“退出登录后当前令牌失效”和“重置密码后旧认证失效”，工程实现增加 `auth_sessions`。它不承载用户资料，只保存令牌的服务端会话标识、所属用户、过期时间和撤销时间；前台永不读取该表。后端认证实现时，JWT 的 `jti` 必须与未撤销、未过期的会话匹配。索引：主键 `id`；外键 `user_id → users.id`；`(user_id, revoked_at, expires_at)` 与 `expires_at` 用于当前用户会话撤销和清理任务。
