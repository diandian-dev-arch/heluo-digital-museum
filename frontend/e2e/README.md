# 隔离业务浏览器验收

测试只允许访问本机回环地址。管理员凭据从已忽略的
`artifacts/sitewide-quality/current-environment.json` 读取，不使用日常演示账号。
每次测试创建随机用户和临时业务数据；数据保留在隔离数据库中，便于失败定位。
测试结束时自动撤回临时文章、下架临时商品，不删除业务记录，也不影响后续公开页截图。

## 本地运行

在仓库根目录构建后端，再在 `frontend` 中构建并启动质量环境：

```powershell
mvn -f backend/pom.xml -DskipTests package
cd frontend
corepack pnpm build
node scripts/quality-environment.mjs
corepack pnpm exec tsc -p e2e/tsconfig.json
corepack pnpm exec playwright test --workers=1
```

本地质量环境使用独立 H2 数据目录，页面为 `http://127.0.0.1:4189`。
Windows 优先使用已安装的 Chrome；其他环境先执行
`corepack pnpm exec playwright install chromium`。
测试报告写入 `artifacts/sitewide-quality/business-results.json`，失败截图写入同目录下的
`business-results/`。不保存含登录请求的 trace，也不要分享环境凭据文件。

### Windows 原生 MySQL

已安装的 `mysqld.exe`、`mysql.exe` 需要在 PATH 中，`JAVA_HOME` 需要指向 Java 17。
从上述构建完成后的 `frontend` 目录执行：

```powershell
node scripts/quality-mysql-environment.mjs
$env:HELUO_QUALITY_ENV_FILE = (Resolve-Path ../artifacts/sitewide-quality/mysql-environment.json).Path
corepack pnpm exec playwright test --workers=1
node scripts/quality-mysql-environment.mjs --stop
```

页面为 `http://127.0.0.1:4192`，API 为 `http://127.0.0.1:18082`，MySQL 使用端口 `13306`。
脚本为每次运行创建新数据目录和随机凭据，并复制当次 JAR、前端构建及 SHA-256 指纹。
Windows MySQL 使用 `%TEMP%/heluo-mysql-quality-<时间戳>` 的 ASCII 物理路径，
`artifacts/sitewide-quality/mysql-data-<时间戳>` 为对应目录联接；停止时保留两者和所有业务记录。
已有端口占用时直接退出，不会停止现有 MySQL 服务；停止前核对进程命令中的本次独有路径。
4190 属于浏览器限制端口，不能作为替代入口。报告写入
`artifacts/sitewide-quality/business-mysql-results.json`，不会覆盖 H2 报告。

## CI 覆盖

### 实际 Docker 部署拓扑

在 frontend 运行 `node scripts/quality-docker-environment.mjs`。脚本从当前源码创建冻结副本，以实际 Compose 构建独立 MySQL/后端/Nginx/Mailpit 服务；4196、8027 仅绑定回环。已有端口占用时退出，凭据保存在忽略目录，不要分享环境 JSON。

设置 `$env:HELUO_QUALITY_ENV_FILE = (Resolve-Path ../artifacts/sitewide-quality/docker-environment.json).Path` 后执行 `pnpm exec playwright test --workers=1`，报告为 `business-docker-results.json`。`node scripts/load-audit.mjs` 使用同一环境，仅对公开读接口施压。`node scripts/quality-docker-environment.mjs --stop` 停止但保留容器、镜像、卷和测试数据。

要验证根 Dockerfile 的 PocketBay 打包路径，在已创建 Compose 冻结副本后运行 `node scripts/quality-pocketbay-environment.mjs`，它从相同模块源码另建独立镜像/H2 卷，监听回环 4197，不访问生产。将 `HELUO_QUALITY_ENV_FILE` 改为 `pocketbay-environment.json` 的绝对路径再跑 E2E，报告为 `business-pocketbay-results.json`。`--check` 只读复核已有服务；`holistic-pocketbay-restart-audit.mjs` 仅重启元数据明确指定的本地隔离容器，核对已支付订单和令牌持久性。不要用于真实用户数据库。

这两种环境分别验证 MySQL 和 H2，不能互相替代；均不证明外层托管平台、真实手机或公网邮件通过。

`business-mysql` job 启动隔离 MySQL 8、Spring Boot 和 Vite preview，执行相同测试。
数据库凭据由当次 CI 运行编号生成，管理员密码和 JWT 密钥在启动时随机生成；
CI 上传测试结果与服务日志，排除环境凭据文件。

覆盖预约登录续填与管理员确认、预约响应丢失后的原摘要锁定和幂等恢复、购物车变更期间禁止结算、支付响应丢失后的恢复与幂等重放、
后台草稿发布撤回、普通用户越权，以及 21 条预约/订单和 25 条搜索结果的完整分页。
测试不接入真实支付或 SMTP，也不替代实体移动设备验收。
