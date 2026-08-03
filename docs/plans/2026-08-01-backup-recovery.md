# MySQL 备份与隔离恢复实施记录

- 日期：2026-08-01
- 关联需求：N-05
- 状态：已完成

## 目标

为本机 Docker Compose 演示环境提供不提交到 Git 的数据库备份，并验证备份可以恢复到隔离数据库，不覆盖当前演示数据。

## 交付物

- `deploy/scripts/backup-mysql.ps1`：使用 `mysqldump --single-transaction` 生成 SQL 备份。
- `deploy/scripts/restore-mysql.ps1`：默认恢复到 `museum_recovery_test`，只有显式 `-Confirm` 才允许指定当前 `museum` 库。
- `deploy/backups/`：已加入 `.gitignore`，不进入仓库。
- `deploy/README.md`：补充备份和恢复命令。

## 验证记录

1. 运行备份脚本，生成约 52 KB 的 SQL 文件。
2. 将备份恢复到隔离库 `museum_recovery_test_0801`。
3. 查询恢复库得到 Flyway 历史 6 条、用户记录 3 条。
4. 删除隔离测试库，不影响当前 `museum` 演示库。
5. Docker Compose 服务仍为运行状态，MySQL healthcheck 和 `/api/v1/health` 均通过。

## 风险边界

- 备份文件包含演示数据，不得提交或上传到公共仓库。
- 生产环境需要独立的密钥管理、加密备份、定期保留策略和异地恢复演练；本记录只覆盖本机课程项目。
