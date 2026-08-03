# 审查问题修复与验收

- 日期：2026-08-03
- 关联需求：F-05、F-08、F-09、F-10、N-02
- 状态：已实施并完成本轮 Docker、真实 MySQL 并发与邮件验收

## 目标

修复代码审查确认的密码重置令牌日志泄露、订单重复创建锁库、支付网络失败不可恢复、购物车数量越库存和 3D 异步加载资源泄露问题。

## 影响范围

- 后端：通知日志、购物车、订单、Flyway V17、集成测试。
- 前端：商城待支付恢复、购物袋状态、3D 展项生命周期、组件测试。
- 文档：API 契约、测试计划、需求追踪、项目状态和 Git 忽略规则。

## 实施

1. 密码重置通过标准 SMTP 发送链接；Compose 默认使用 Mailpit 测试收件箱。原始令牌只存在于一次性邮件正文，不记录到日志、数据库明文字段或 API 响应。
2. 创建订单要求 `Idempotency-Key`，以 `(user_id, checkout_idempotency_key)` 唯一约束保存；事务先锁定用户购物车行，再锁定购物车项并读取当前订单，避免 MySQL `REPEATABLE READ` 旧快照与不存在唯一键的间隙锁死锁。
3. 支付和取消订单先锁订单行；支付幂等记录使用锁定读。前端在创建订单前保存用户隔离的待结算上下文，并在任何网络加载前恢复；支付失败后继续原订单及同一支付键，未收到创建响应时重放同一创建键。
4. 购物车增减在服务端校验商品上架状态和当前可用库存。
5. 3D 组件以初始化代际和已释放标志拒绝迟到的 GLTF 回调，并释放迟到模型的几何体、材质和纹理。
6. 忽略 Hallmark 生成日志与预检输出。

## 验收标准

- 原始重置令牌不出现在应用日志或响应中。
- 重复创建与支付请求只返回同一订单/支付结果，库存仅锁定或扣减一次，且 MySQL 并发请求不发生死锁。
- 支付失败不创建第二笔订单，购物袋显示继续支付入口。
- 直接篡改购物车数量超过库存时，返回冲突且数据不变。
- 离开展项页后迟到模型资源被释放。
- `pnpm typecheck`、`pnpm test`、`pnpm build`、`mvn test`、Docker HTTP/API health 全部通过。

## 验证记录

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test -- --run`：10 个文件、38 项通过；包含购物袋请求失败时恢复待支付订单的回归。
- `mvn test -q`：10 项通过，空 H2 数据库成功执行 Flyway V1-V17；新增 SMTP 邮件正文和无 SMTP 失败隔离测试。
- `corepack pnpm build`：通过；仅保留既有 Rollup `#__PURE__` 注释与 Three.js 大 chunk 警告。
- `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build backend frontend mailpit`：通过；前台 `/` HTTP 200，`/api/v1/health` 返回 `OK/UP`，MySQL 和 Mailpit 均运行。
- 真实 MySQL：同一用户以四个并发 `POST /orders` 和四个并发 `POST /orders/{id}/mock-payment` 验收，八个请求均为 HTTP 200，仅保留一笔订单且最终为 `PAID`。
- 邮件：Mailpit 收到密码重置邮件；脚本从邮件正文读取一次性链接，在不输出令牌的前提下完成重置密码并以新密码重新登录；后端日志未检出重置 URL 或原始令牌标记。
