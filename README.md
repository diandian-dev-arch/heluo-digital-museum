# 河洛数字博物馆

面向 18～30 岁年轻文化探索者的课程项目：用户先在线浏览馆藏、文章和自创 3D 展项，再预约线下参观；同时提供文创商城与模拟支付、管理员运营后台。

## 当前实现

- 前台：馆藏/文章分类浏览、关键词搜索、详情、3D 展厅、预约、注册登录、个人中心、购物车、订单和模拟支付。
- 后台：内容、3D 展项、用户、预约时段与预约、商品、订单、基础统计和操作日志。
- 技术：Vue 3 + TypeScript + Vite、Spring Boot 3（Java 17）、MySQL 8、Flyway、Docker Compose。
- 第一版边界：仅模拟支付；管理员不能公开注册；邮件在本地环境记录为开发邮件日志。

> 开发演示数据均明确标为概念内容；3D 模型和图片仅引用项目组自创资产。正式展示前需要核对史实文案和资产台账。

## 本地启动（推荐）

前提：Docker Desktop 已启动。

```powershell
Set-Location "C:\Users\Jie\Documents\博物馆"
Copy-Item "deploy\.env.example" "deploy\.env"
docker compose --env-file deploy\.env -f deploy\compose.yaml up --build -d
docker compose --env-file deploy\.env -f deploy\compose.yaml ps
```

访问：

- 前台：<http://localhost:8088>
- 健康检查：<http://localhost:8088/api/v1/health>

管理员初始化信息由本机 `deploy\.env` 中的 `MUSEUM_BOOTSTRAP_ADMIN_*` 配置决定；该文件被 Git 忽略，不能提交。

停止服务：

```powershell
docker compose --env-file deploy\.env -f deploy\compose.yaml down
```

## 本地开发与检查

```powershell
# 前端
Set-Location frontend
pnpm install
pnpm typecheck
pnpm test
pnpm build

# 后端
Set-Location ..\backend
mvn test
```

## 项目文档

- [项目状态与下一步](PROJECT_STATUS.md)
- [需求追踪表](docs/01-requirements-traceability.md)
- [数据模型与权限](docs/04-data-and-permissions.md)
- [API 契约](docs/05-api-design.md)
- [测试与验收计划](docs/06-test-plan.md)

未经用户确认，不提交或推送本项目的 Git 变更。
