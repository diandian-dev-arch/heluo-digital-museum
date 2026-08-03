# 五阶段推进最终验收计划

- 日期：2026-08-01
- 状态：已完成
- 关联需求：F-01～F-13、A-01～A-02、N-01～N-06。

## 已有可复现证据

- 后端：`mvn test` 通过；测试数据库从 Flyway v1～v6 空库迁移，覆盖普通用户后台越权 `403`、预约取消释放名额、模拟支付幂等和库存只扣一次。
- 前端：`pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
- Docker：Compose 配置校验通过；MySQL 健康，前端、后端容器运行；`/api/v1/health` 返回 `UP`。
- 浏览器：首个自创 GLB 已加载；核心前台页面在 390px 视口无关键横向滚动；首页、探索、预约、商城、登录的英文静态文案已切换验证。
- 性能：已按自定 N-04 本机课程项目标准执行 10 并发、100 次公开读请求，成功率 100%、P95 154ms、最大 235ms，满足成功率 ≥99%、P95 ≤500ms、最大 ≤1500ms；详见 `docs/06-test-plan.md`。
- 资产：已核对 5 个馆藏封面、3 个商品封面和青铜鼎封面对应的 WebP 文件；`assets/models/bronze-ding/source/` 保留 Blender 源文件，`export/heluo-bronze-ding-v4.glb` 与 `frontend/public/media/models/heluo-bronze-ding-v4.glb` 均存在且大小为 780000 字节。项目组已确认自创图片、青铜鼎 GLB、Blender 源文件和当前概念文案可作为最终展示资产。
- 三角色浏览器回归：游客已验证内容入口、3D 展项及中英文切换；普通用户完成注册、登录、预约提交、加购与模拟支付；管理员确认上述预约、完成上述订单、查看统计和操作日志，并完成文物的编辑、发布、撤回、软删除、回收站恢复验证。
- 安全与恢复：非法注册输入返回 422 且响应不含 `passwordHash`、`accessToken`、堆栈字段；已生成 `deploy/backups/` 下的 MySQL 备份，并恢复到隔离库，验证 Flyway 历史 6 条、用户记录 3 条；详见 `docs/plans/2026-08-01-backup-recovery.md`。

## 收尾动作

1. 用户确认最终验收范围后，再审查 Git diff、暂存并提交；此前不提交。
