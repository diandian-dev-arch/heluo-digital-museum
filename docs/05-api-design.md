# REST API 契约

## 2026-09-17 双语内容检索契约

- `GET /search` 以及 `GET /artifacts`、`GET /articles` 的 `keyword` 同时匹配中文标题/摘要和英文标题/摘要；英文大小写不敏感，首尾空白被去除，`%`、`_`、`!` 按字面匹配。连续短语不拆词，不提供同义词或语义搜索。
- 搜索必传 keyword；两个内容列表可以省略以浏览全部。显式空白或去空格后超过 100 个字符返回 422。type、page、size、公开可见性和排序保持原约定。
- 文物/文章公开列表、详情及搜索结果增加 `titleEn: string | null`、`summaryEn: string | null`；现有 `title/summary` 继续返回中文，不随语言切换。前端按语言逐字段选择，缺译回退中文。
- 后台文物/文章创建、列表、详情、PATCH 同步支持 titleEn（最多300字符）和 summaryEn（最多1000字符）。创建时可省略；PATCH 省略不修改，显式 null 或空白清除，非文本值及超长字段返回422。管理员权限保持不变。

## 2026-09-10 公开发现文档

`GET/HEAD /robots.txt` 返回 UTF-8 文本，`GET/HEAD /sitemap.xml` 返回 UTF-8 XML；两者允许匿名访问，非 GET/HEAD 不获得额外权限。URL 基址取已有 `museum.mail.public-base-url` / `MUSEUM_PUBLIC_BASE_URL`，启动时验证为无路径、查询、片段或凭据的 HTTP(S) origin。

站点地图实时包含五个公开入口及公开 API 可见的文物、文章、展项详情；不收录登录、个人中心和后台。按公开内容状态/软删除/分类条件及展项关联条件过滤，Cache-Control 为 no-store，不返回数据库内部字段。Compose Nginx 与 PocketBay Spring Boot 共用此实现；错误不得以旧静态索引伪装成功。

- 文档版本：v1.3
- 最后更新：2026-09-08
- 数据依据：[数据模型与权限](04-data-and-permissions.md)、[完整 ER 图](07-er-diagram.md)、[需求追踪表](01-requirements-traceability.md)。
- 实现依据：后端以 OpenAPI 生成最终机器可读接口文档；本文件是编码前的产品/API 契约。

## 1. 通用约定

### 1.1 基础规则

```text
Base URL: /api/v1
Content-Type: application/json; charset=utf-8
认证：Authorization: Bearer <access-token>
时间：ISO 8601 UTC，例如 2026-08-01T12:30:00Z
金额：JSON 中以字符串表示，例如 "99.00"，避免浮点误差
```

- 所有写操作要求 `Content-Type: application/json`；创建订单和模拟支付均要求 `Idempotency-Key` 请求头。两类请求各自使用稳定且不超过 64 字符的键。
- 前端不得传入或信任 `userId`、角色、管理员标记、商品金额、库存或状态等服务端决定的字段。
- 列表接口使用 `page`（从 1 开始）和 `size`（默认 20，最大 100）；无分页的下拉选项接口会明确说明。
- `keyword` 只搜索第一版已确认的标题和摘要；服务端会去除首尾空格，空关键词返回 422。

### 1.1.1 就绪与异常恢复（2026-09-08）

- `GET /api/v1/health` 保持原有存活语义，返回 `data.status=UP`，不访问数据库。
- 新增公开只读 `GET /api/v1/ready`：数据库 `select 1` 成功返回 200 与 `data.status=UP`，失败返回 503、`code=SERVICE_UNAVAILABLE`、`data.status=DOWN`。响应为 `Cache-Control: no-store`；数据库池连接等待最多 5 秒，查询超时 2 秒。
- 每个 `/api/` 请求由服务端生成 UUID；响应 `X-Request-Id`、JSON `requestId` 与日志 MDC 使用同一编号。忽略来访请求自行提供的编号；日志不记录查询参数、请求体或令牌。
- 401 表示身份失效，前端合并为一次登录恢复；403 表示权限不足且保留会话。认证期间数据库不可用返回 503，临时网络故障不会清除本地凭据。
- 请求工具默认 15 秒超时，支持可选 `AbortSignal/timeoutMs`；取消、超时和断网分别为前端 `REQUEST_ABORTED/REQUEST_TIMEOUT/NETWORK_ERROR`。写请求不自动重放，预约、下单和模拟支付由原幂等键恢复。
- PocketBay Java 静态入口对未知公开页面路径返回 404 并转发 Vue 入口，显示站内恢复导航；`/api`、`/actuator`、`/assets`、`/media` 与带扩展名资源保持原鉴权/资源行为，不进入页面回退。
- 已过期订单支付返回 409 `ORDER_PAYMENT_EXPIRED` 前提交取消及库存释放；重复模拟支付不重复扣减库存。密码重置令牌在单一事务内原子消费，并发最多成功一次。
- 预约日期和取消截止判断统一使用 `Asia/Shanghai` 的业务时钟；接口中的绝对时间仍使用 ISO 8601。邮件在业务事务提交后进入有界后台队列，失败不回滚业务结果。

### 1.2 响应信封

成功：

```json
{
  "code": "OK",
  "message": "success",
  "data": {},
  "requestId": "req_..."
}
```

分页成功：

```json
{
  "code": "OK",
  "message": "success",
  "data": {
    "items": [],
    "page": 1,
    "size": 20,
    "total": 0,
    "totalPages": 0
  },
  "requestId": "req_..."
}
```

错误：

```json
{
  "code": "VALIDATION_ERROR",
  "message": "请求参数不合法",
  "fieldErrors": [
    { "field": "username", "message": "用户名长度应为 3 到 32 位" }
  ],
  "requestId": "req_..."
}
```

不得在响应中返回 `passwordHash`、访问令牌原文、SMTP 配置、内部堆栈或未脱敏的其他用户联系人信息。

### 1.3 HTTP 状态与业务错误码

| HTTP | code | 使用场景 |
|---:|---|---|
| 400 | `BAD_REQUEST` | 请求格式、JSON 或分页排序参数不合法。 |
| 401 | `AUTH_REQUIRED` / `AUTH_INVALID` | 未登录、令牌失效或认证无效。 |
| 403 | `FORBIDDEN` | 已登录但不具备管理员角色，或资源不属于当前用户。 |
| 404 | `RESOURCE_NOT_FOUND` | 公开内容不存在、已撤回或已软删除；不泄露其后台状态。 |
| 409 | `CONFLICT` | 用户名/邮箱已存在、重复预约、重复状态转换、库存/支付并发冲突。 |
| 422 | `VALIDATION_ERROR` | 字段校验、时间、状态流转、人数、邮箱或金额不符合规则。 |
| 429 | `RATE_LIMITED` | 注册、登录、找回密码等接口触发限流。 |
| 500 | `INTERNAL_ERROR` | 未预期服务端错误；响应不得泄露内部细节。 |

常用业务码：`ACCOUNT_DISABLED`、`INVALID_CREDENTIALS`、`PASSWORD_RESET_NOT_AVAILABLE`、`SLOT_UNAVAILABLE`、`APPOINTMENT_CANCEL_DEADLINE_PASSED`、`PRODUCT_UNAVAILABLE`、`INSUFFICIENT_STOCK`、`ORDER_PAYMENT_EXPIRED`、`PAYMENT_ALREADY_PROCESSED`。

## 2. 认证与个人中心

| 方法 | 路径 | 权限 | 请求重点 | 成功响应重点 |
|---|---|---|---|---|
| POST | `/auth/register` | 公开 | `username`、`password`、`nickname`；`email`/`phone`可选 | 普通用户资料，不返回密码。 |
| POST | `/auth/login` | 公开 | `username`、`password` | `accessToken`、`expiresAt`、当前用户与角色。 |
| POST | `/auth/logout` | 已登录 | 无 | 当前令牌失效确认。 |
| GET | `/auth/me` | 已登录 | 无 | 当前用户资料、角色、账号状态。 |
| PATCH | `/users/me` | 已登录 | 可改 `nickname`、`email`、`phone` | 更新后的个人资料。 |
| POST | `/auth/password-reset/request` | 公开 | `username`、`email` | 始终返回 202 通用提示，避免账号枚举；匹配账号仅将一次性重置链接投递至 SMTP 邮件正文。 |
| POST | `/auth/password-reset/confirm` | 公开 | `resetToken`、`newPassword` | 密码已更新；旧认证失效。 |

注册约束：用户名 3～32 位英文字母/数字/下划线；密码强度由后端统一校验；公开注册永远只授予 `USER`。找回密码仅发送到已绑定邮箱，未绑定邮箱由管理员人工重置。

## 3. 公开内容、搜索与 3D 展项

### 3.1 公开读取接口

| 方法 | 路径 | 权限 | 查询/路径参数 | 返回重点 |
|---|---|---|---|---|
| GET | `/categories` | 公开 | 无分页 | 已启用的一级分类，按 `sortOrder` 排序。 |
| GET | `/artifacts` | 公开 | `page`、`size`、`categoryCode?`、`keyword?`、`sort=publishedAt,desc` | 已发布且未删除的文物卡片。 |
| GET | `/artifacts/{slug}` | 公开 | `slug` | 文物详情、封面、分类、3D 展项摘要。 |
| GET | `/articles` | 公开 | 同文物列表 | 已发布且未删除的文章卡片。 |
| GET | `/articles/{slug}` | 公开 | `slug` | 文章详情、封面、分类和正文。 |
| GET | `/exhibits` | 公开 | `page`、`size`、`artifactSlug?` | 可公开展示的 3D 展项卡片。 |
| GET | `/exhibits/{slug}` | 公开 | `slug` | 说明、封面、默认模型字段，以及可空的 `mobileModelUrl`、`mobileModelSizeBytes`。 |
| GET | `/search` | 公开 | `keyword`、`type=all|artifact|article`、`page`、`size` | 标题/摘要匹配的混合结果。 |

公开详情若为草稿、撤回或软删除，统一返回 `404 RESOURCE_NOT_FOUND`。`modelSourceRef`、后台操作人和资产源文件路径不返回给前端。

3D 展项详情中的模型字段约定：

| 字段 | 类型 | 语义 |
|---|---|---|
| `modelUrl` | `string` | 必填的默认桌面模型 URL。 |
| `modelFormat` | `"GLB" \| "GLTF"` | 默认模型格式。 |
| `modelSizeBytes` | 正整数 | 默认模型文件大小。 |
| `mobileModelUrl` | `string \| null` | 可选移动 LOD URL；为空时客户端使用 `modelUrl`。 |
| `mobileModelSizeBytes` | 正整数 `\| null` | 可选移动 LOD 文件大小，与 `mobileModelUrl` 成对出现。 |

### 3.2 管理内容接口

所有 `/admin/*` 接口均要求 `ADMIN`。列表默认排除软删除记录；传 `deleted=true` 时进入回收站视图。

| 方法 | 路径 | 作用 |
|---|---|---|
| GET/POST | `/admin/categories` | 分类列表/创建。 |
| PATCH | `/admin/categories/{id}` | 编辑名称、简介、排序、启用状态。 |
| GET/POST | `/admin/artifacts` | 后台文物列表/创建草稿。 |
| GET/PATCH | `/admin/artifacts/{id}` | 查看/编辑文物。 |
| POST | `/admin/artifacts/{id}/publish` | 发布文物。 |
| POST | `/admin/artifacts/{id}/withdraw` | 撤回文物。 |
| DELETE | `/admin/artifacts/{id}` | 软删除。 |
| POST | `/admin/artifacts/{id}/restore` | 从回收站恢复为 `WITHDRAWN`。 |
| GET/POST | `/admin/articles` | 后台文章列表/创建草稿。 |
| GET/PATCH | `/admin/articles/{id}` | 查看/编辑文章。 |
| POST | `/admin/articles/{id}/publish` | 发布文章。 |
| POST | `/admin/articles/{id}/withdraw` | 撤回文章。 |
| DELETE/POST | `/admin/articles/{id}` / `/admin/articles/{id}/restore` | 软删除/恢复。 |
| GET/POST | `/admin/exhibits` | 后台 3D 展项列表/创建草稿；读写默认模型和可选移动模型字段。 |
| GET/PATCH | `/admin/exhibits/{id}` | 查看/编辑展项资料；读写默认模型和可选移动模型字段。 |
| POST | `/admin/exhibits/{id}/publish` | 发布展项；检查关联文物可公开。 |
| POST | `/admin/exhibits/{id}/withdraw` | 撤回展项。 |
| DELETE/POST | `/admin/exhibits/{id}` / `/admin/exhibits/{id}/restore` | 软删除/恢复。 |

创建/编辑文物、文章和展项时，后端以相应数据模型字段为准；不得由客户端填写 `status`、审计字段或软删除字段。发布接口执行状态转换与必要校验，所有关键操作写入 `operation_logs`。

管理端展项请求中的 `mobileModelUrl` 与 `mobileModelSizeBytes` 均可省略，但必须同时填写或同时留空；URL 最长 500 字符，大小必须为至少 1 字节的整数。只提交其中一个字段时返回 `422 VALIDATION_ERROR`。后台读取当前以空字符串表示缺失的 `mobileModelUrl`，以 `null` 表示缺失的 `mobileModelSizeBytes`；大小使用 64 位整数，不截断超过 32 位的值。

## 4. 预约接口

| 方法 | 路径 | 权限 | 请求/查询重点 | 返回重点 |
|---|---|---|---|---|
| GET | `/appointment-slots` | 公开 | `dateFrom?`、`dateTo?` | 未来 `OPEN` 且未约满的时段、剩余名额。 |
| POST | `/appointments` | 用户 | `slotId`、`visitorCount`、`contactName`、`contactPhone`、`contactEmail`、`notes?` | 新预约，初始 `PENDING`。 |
| GET | `/appointments/me` | 用户 | `page`、`size`、`status?` | 当前用户预约历史。 |
| GET | `/appointments/{id}` | 用户/管理员 | `id` | 用户仅可读自己的；管理员可读全部。 |
| POST | `/appointments/{id}/cancel` | 用户/管理员 | `reason?` | 取消结果，遵循开始前 2 小时截止规则。 |
| GET/POST | `/admin/appointment-slots` | 管理员 | 时段筛选/新建时段 | 预约时段管理。 |
| PATCH | `/admin/appointment-slots/{id}` | 管理员 | 容量、状态、时间 | 不允许容量低于已占用人数。 |
| GET | `/admin/appointments` | 管理员 | 日期、时段、状态、分页 | 预约运营列表。 |
| POST | `/admin/appointments/{id}/confirm` | 管理员 | 无 | `PENDING → CONFIRMED` 并尝试发送邮件。 |
| POST | `/admin/appointments/{id}/cancel` | 管理员 | `reason` 必填 | 取消、释放名额并尝试发送邮件。 |
| POST | `/admin/appointments/{id}/complete` | 管理员 | 无 | 时段结束后 `CONFIRMED → COMPLETED`。 |

创建预约、确认和取消必须在事务内维护时段的 `reservedPeople`；邮件投递失败不会回滚已经成功的状态变更，但需记录可查询的投递结果。

## 5. 商城、购物车、订单与模拟支付

### 5.1 用户接口

| 方法 | 路径 | 权限 | 请求/查询重点 | 返回重点 |
|---|---|---|---|---|
| GET | `/products` | 公开 | `page`、`size`、`keyword?` | 上架且未删除商品。 |
| GET | `/products/{slug}` | 公开 | `slug` | 商品详情、当前价格与可用库存提示。 |
| GET | `/cart` | 用户 | 无 | 当前购物车项、当前价格、失效商品提示。 |
| POST | `/cart/items` | 用户 | `productId`、`quantity` | 添加或累加商品；每种最多 10 件。 |
| PATCH | `/cart/items/{id}` | 用户 | `quantity` | 修改自己的购物车项数量。 |
| DELETE | `/cart/items/{id}` | 用户 | 无 | 删除自己的购物车项。 |
| POST | `/orders` | 用户 | Header `Idempotency-Key`；`cartItemIds`、`notificationEmail` | 创建待支付订单；锁定库存；30 分钟过期；同一用户重复键返回原订单。 |
| GET | `/orders` | 用户 | `page`、`size`、`status?` | 当前用户订单列表。 |
| GET | `/orders/{id}` | 用户/管理员 | `id` | 用户仅可读自己的订单。 |
| POST | `/orders/{id}/cancel` | 用户 | `reason?` | 取消自己的待支付订单，释放锁定库存。 |
| POST | `/orders/{id}/mock-payment` | 用户 | Header `Idempotency-Key` | 模拟支付成功、扣减库存、发送状态邮件。 |

创建订单时必须以当前上架商品价格重新计算，忽略客户端价格；通知邮箱必填并存为订单快照。创建订单会锁定指定购物车项，避免并发请求重复锁库；前端在订单创建前持久化结算键和支付键，网络失败后继续原订单支付。`mock-payment` 对同一幂等键重复调用返回同一支付结果，不再次扣库存。

### 5.2 管理后台接口

| 方法 | 路径 | 作用 |
|---|---|---|
| GET/POST | `/admin/products` | 后台商品列表/创建商品。 |
| GET/PATCH | `/admin/products/{id}` | 查看/编辑商品、价格、库存和图片引用。 |
| POST | `/admin/products/{id}/on-shelf` | 上架商品。 |
| POST | `/admin/products/{id}/off-shelf` | 下架商品。 |
| DELETE/POST | `/admin/products/{id}` / `/admin/products/{id}/restore` | 软删除/恢复。 |
| GET | `/admin/orders` | 按状态、日期、用户等筛选订单。 |
| POST | `/admin/orders/{id}/complete` | `PAID → COMPLETED`，管理员手动确认。 |

## 6. 后台用户、统计与操作日志

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/admin/users` | 用户分页列表；不返回密码摘要。 |
| POST | `/admin/users` | 创建普通用户账号。 |
| PATCH | `/admin/users/{id}/status` | 禁用或恢复普通用户；不能禁用唯一管理员。 |
| POST | `/admin/users/{id}/reset-password` | 管理员人工发起一次性重置流程。 |
| GET | `/admin/dashboard/summary` | 用户数、预约数、订单数、销售额等基础汇总。 |
| GET | `/admin/operation-logs` | 管理员关键操作日志；需分页、日期和模块筛选。 |

第一版不提供创建第二个管理员、授予 `ADMIN`、真实支付退款、物流或公开查看操作日志的接口。

## 7. API 验收与 OpenAPI 落地

- 每个接口在实现时必须标注请求 DTO、响应 DTO、角色要求、`401/403/404/409/422` 可能性和 OpenAPI 注释。
- 公开列表默认只返回可公开状态；管理员列表和回收站接口必须显式区分。
- 所有 `PATCH`、状态转换、库存与支付接口必须编写正向、越权、并发/重复、非法状态四类测试。
- 前端仅使用本文件定义的公开字段；如接口字段需变动，先更新本文件、OpenAPI 和需求追踪表。
