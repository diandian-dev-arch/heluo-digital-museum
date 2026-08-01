# 本地容器运行

1. 从本目录复制环境变量：`Copy-Item .env.example .env`。
2. 在 `deploy/.env` 中替换两个本地密码，不要提交该文件。
3. 在仓库根目录运行：`docker compose -f deploy/compose.yaml up --build`。
4. 浏览器访问 `http://localhost:8088`；后端健康检查为 `http://localhost:8088/api/v1/health`。

`compose.yaml` 使用 MySQL 8.4、Spring Boot API 和 Nginx 承载的 Vue 单页应用。当前仅为工程基线；数据库结构在后续 Flyway 迁移中落地。
