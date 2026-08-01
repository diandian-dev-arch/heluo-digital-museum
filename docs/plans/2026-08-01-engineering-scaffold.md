# 工程脚手架实施计划

- 日期：2026-08-01
- 状态：待用户确认后执行
- 关联：ADR-001、API 契约、ER 图、测试计划。

## 目标

在不改变已确认业务规则的前提下，创建可运行、可测试、可容器化的 Vue 3 + Spring Boot 3 基础工程；本计划不等于已创建工程。

## 预期目录

```text
frontend/                 Vue 3 + TypeScript + Vite
backend/                  Spring Boot 3 + Maven
backend/src/main/resources/db/migration/  Flyway 迁移
backend/src/test/         后端测试
deploy/                   Docker Compose、.env.example
docs/                     需求、架构、接口、测试、ER 图
loadtest/                 公开读接口和关键写接口压测脚本
```

## 前端初始化范围

1. Vue 3、TypeScript、Vite、Vue Router、Pinia、Element Plus。
2. 建立公开前台布局、后台布局、路由守卫、请求客户端、错误处理和国际化骨架。
3. 建立页面占位路由：首页、内容、3D、预约、商城、订单、登录、个人中心、后台模块。
4. 建立 Vitest、类型检查、生产构建脚本；不在初始化阶段一次写完全部业务页面。

## 后端初始化范围

1. Java 17、Spring Boot 3、Spring Web、Validation、Spring Security、JWT、MySQL、Flyway、测试依赖。
2. 包结构建议：`com.heluo.museum` 下按 `auth`、`content`、`appointment`、`commerce`、`admin`、`common` 划分模块。
3. 建立统一响应信封、全局异常处理、认证/授权骨架、审计日志接口、健康检查与 OpenAPI。
4. 使用 Flyway 从空库创建所有已设计核心表；不手工修改数据库结构。
5. 为认证、内容公开读取、预约状态与模拟支付先建立测试骨架。

## 部署与配置范围

1. 创建 `deploy/.env.example`，只放变量名和安全说明，不放真实密钥。
2. Docker Compose 包含 MySQL、Redis（若启用）和前后端服务；邮件在开发环境使用可替换的安全测试方案，不写真实 SMTP 凭据。
3. 启动后必须执行：构建、迁移、健康检查、`docker compose ps`，不能只验证 Compose 语法。

## 推荐实施顺序

```text
1. Git 基线确认
2. 前端/后端项目初始化与依赖锁定
3. 本地 MySQL + Flyway 空库迁移
4. 认证与 USER/ADMIN 种子数据
5. 内容公开读取 + 后台内容管理
6. 预约闭环
7. 商城订单与模拟支付
8. 3D 前端接入与资产浏览器验收
9. Docker 化、CI、压测、最终演示
```

## 初始化验收

- 前端可运行、类型检查、测试、构建全部通过。
- 后端可启动、健康检查正常、迁移从空库执行成功、测试通过。
- 前后端通过 `/api/v1` 完成最小健康请求，不直连数据库。
- `.env`、构建产物、依赖目录、数据库备份不进入 Git。
- CI 至少执行前端检查、后端测试和 Compose 配置检查。

## 风险

- 邮箱通知需要安全 SMTP 或开发替代方案，不能在仓库保存凭据。
- 真实支付、短信、物流不属于第一版；任何接入需新的需求与 ADR。
- 3D 模型、图片要继续执行 Web 优化与浏览器验收，源文件不能误作为前台公开资源。
