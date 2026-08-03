# 本地容器运行

1. 从本目录复制环境变量：`Copy-Item .env.example .env`。
2. 在 `deploy/.env` 中替换两个本地密码，不要提交该文件。
3. 在仓库根目录运行：`docker compose -f deploy/compose.yaml up --build`。
4. 浏览器访问 `http://localhost:8088`；后端健康检查为 `http://localhost:8088/api/v1/health`。
5. 本地 Compose 默认启动 Mailpit 测试收件箱：`http://localhost:8025`。密码找回、预约和模拟支付通知只投递到这里，不会发送真实邮件；重置令牌不会写入应用日志或 API 响应。

部署到已获批准的 SMTP 服务时，在本地忽略的 `deploy/.env` 中设置 `MUSEUM_SMTP_HOST`、端口、认证和 TLS 变量，并将 `MUSEUM_PUBLIC_BASE_URL` 设为公开前台地址。SMTP 密码不得提交到仓库。

`compose.yaml` 使用 MySQL 8.4、Spring Boot API 和 Nginx 承载的 Vue 单页应用。当前仅为工程基线；数据库结构在后续 Flyway 迁移中落地。

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
