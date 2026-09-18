# 本地容器运行

1. 从本目录复制环境变量：`Copy-Item .env.example .env`。
2. 在 `deploy/.env` 中替换两个本地密码，不要提交该文件。
3. 在仓库根目录运行：`docker compose --env-file deploy/.env -f deploy/compose.yaml up --build`。
4. 浏览器访问 `http://localhost:8088`；存活检查为 `http://localhost:8088/api/v1/health`，数据库就绪检查为 `http://localhost:8088/api/v1/ready`。分别确认 HTTP 200 与 `data.status=UP`。
5. 本地 Compose 默认启动 Mailpit 测试收件箱：`http://localhost:8025`。密码找回、预约和模拟支付通知只投递到这里，不会发送真实邮件；重置令牌不会写入应用日志或 API 响应。

部署到已获批准的 SMTP 服务时，在本地忽略的 `deploy/.env` 中设置 `MUSEUM_SMTP_HOST`、端口、认证和 TLS 变量，并将 `MUSEUM_PUBLIC_BASE_URL` 设为公开前台地址。SMTP 密码不得提交到仓库。

`compose.yaml` 使用 MySQL 8.4、Spring Boot API 和 Nginx 承载的 Vue 单页应用，数据库结构由版本化 Flyway 迁移维护。

## 全站质量隔离环境

在 `backend/` 执行 `mvn -B package`，在 `frontend/` 执行 `corepack pnpm build` 和 `node scripts/quality-environment.mjs`。脚本使用 4189/18081 端口、独立 H2 数据目录与运行时随机管理员，启动完成会验证真实 API 返回。

这是同版本本地演示备用入口，不替代 MySQL 验收。临时凭据与日志位于已忽略的 `artifacts/sitewide-quality/current-environment.json` 和相邻日志；不得提交或共享。停止使用 `node scripts/quality-environment.mjs --stop`。原始数据目录保留，不会覆盖现有 Compose 数据。

Windows 原生 MySQL 8 隔离验收使用 `node scripts/quality-mysql-environment.mjs`，入口 `http://127.0.0.1:4192`，数据库 13306；从 PATH 定位 MySQL，独立目录和凭据，不修改已存在的 MySQL80 服务。当前构建真实压缩/缓存验收使用 `node scripts/quality-production-environment.mjs`，入口 `http://127.0.0.1:4191`，把 dist 放入 JAR 副本并使用独立 H2。两个脚本都支持 `--stop` 且保留数据。临时环境文件只用于本机，不纳入提交。

详细命令、三分钟演示和证据边界见 `docs/reviews/2026-09-08-quality-demo-guide.md`。MySQL 入口验证数据库和业务，生产配置入口用于 gzip、缓存、Range 与前端性能，不将 Vite preview 的无压缩下载指标当作部署指标。

前端 `.env.example` 中 `MUSEUM_DEV_API_URL` 可选择本地 API；它仅用于 Vite 开发/preview 代理，不会把测试服务地址写进生产 bundle。真实 SMTP、真实支付与线上发布不属于本轮质量优化。

## 数据备份与恢复演练

备份文件只写入被 Git 忽略的 `deploy/backups/`：

```powershell
.\deploy\scripts\backup-mysql.ps1
```

恢复演练默认导入隔离库 `museum_recovery_test`，不会覆盖当前演示库：

```powershell
.\deploy\scripts\restore-mysql.ps1 -BackupFile .\deploy\backups\museum-<timestamp>.sql
```

只有明确要覆盖 `museum` 时才传入 `-TargetDatabase museum -Confirm`；恢复后仍需让 Flyway/应用健康检查通过。
# 公开站点索引（2026-09-10）

`GET/HEAD /robots.txt` 与 `/sitemap.xml` 由后端实时生成；Compose 的 Nginx 精确转发这两个地址，PocketBay 直接由 Spring Boot 响应。设置已有 `MUSEUM_PUBLIC_BASE_URL` 为正式 HTTP(S) origin（不能包含路径、查询或凭据），与邮件链接共享同一公开地址。默认值只用于本地环境，正式发布前必须核对。

站点地图包含公开文物、文章、展项和五个公开入口；草稿、软删除、禁用分类及关联文物未发布的展项按对应公开 API 规则过滤。响应不缓存，撤回内容下次请求即消失。`frontend/public` 中旧静态索引不是生产服务来源；直接 Vite preview 不代表生产索引验收。

验收两种部署时均检查匿名 GET/HEAD、XML 解析、绝对 URL、撤回后的过滤和管理接口仍受保护。PocketBay/Cloudflare 可能替换 robots 内容，须在最终公开域名复验；平台返回 204 空响应不等于应用健康。
