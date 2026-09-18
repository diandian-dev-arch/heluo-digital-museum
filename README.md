# 河洛数字博物馆 · Heluo Digital Museum

> 把一件器物的纹理、尺度与故事，变成可以被重新发现的数字展览。

<p>
  <a href="https://heluo.pocketbay.app/"><strong>访问线上展厅 →</strong></a>
  ·
  <a href="https://github.com/diandian-dev-arch/heluo-digital-museum">查看 GitHub 仓库</a>
</p>

河洛数字博物馆是一个面向年轻文化探索者的双语数字博物馆：从馆藏检索、策展式阅读，到可交互的 3D 展厅与线下预约，用户可以先在线建立兴趣，再决定下一次真实到访。

<p>
  <img src="https://img.shields.io/badge/online-heluo.pocketbay.app-c99b5b?style=flat-square" alt="线上地址" />
  <img src="https://img.shields.io/badge/frontend-Vue%203%20%2B%20TypeScript-42b883?style=flat-square" alt="前端技术" />
  <img src="https://img.shields.io/badge/backend-Spring%20Boot%203-6db33f?style=flat-square" alt="后端技术" />
  <img src="https://img.shields.io/badge/search-Chinese%20%2B%20English-b88a44?style=flat-square" alt="双语搜索" />
</p>

## 线上体验

线上版本：**[https://heluo.pocketbay.app/](https://heluo.pocketbay.app/)**

建议从以下路径开始：

1. 在 **Explore / 探索馆藏** 中浏览器物、主题和双语摘要；
2. 打开 **3D Gallery / 数字展厅**，切换视角并观察器物细节；
3. 通过 **Visit Booking / 预约参观** 查看参观信息和可用时段。

## 页面掠影

以下为项目历史验收中保存的真实完整页面截图，覆盖主页、Explore 和 3D 展厅，非概念设计图，也非本次线上实时截图。统一采用 1440 像素桌面宽度，保留页面从顶部到末尾的内容；点击图片可查看原尺寸。线上内容可能随版本更新而变化。

<table>
  <tr>
    <td width="50%" align="center"><strong>首页 · 中文浅色</strong></td>
    <td width="50%" align="center"><strong>首页 · 中文深色</strong></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/showcase/home-light-zh.png"><img src="docs/showcase/home-light-zh.png" alt="中文浅色首页完整页面：明亮展馆、器物介绍与主题入口" /></a></td>
    <td width="50%"><a href="docs/showcase/home-dark-zh.png"><img src="docs/showcase/home-dark-zh.png" alt="中文深色首页完整页面：深色展馆、器物介绍与主题入口" /></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><strong>首页 · 英文深色</strong></td>
    <td width="50%" align="center"><strong>Explore · 英文深色</strong></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/showcase/home-dark-en.png"><img src="docs/showcase/home-dark-en.png" alt="英文深色首页完整页面" /></a></td>
    <td width="50%"><a href="docs/showcase/explore-dark-en.png"><img src="docs/showcase/explore-dark-en.png" alt="Explore 双语藏品浏览页" /></a></td>
  </tr>
  <tr>
    <td align="center"><sub>主页 · One object, a living story</sub></td>
    <td align="center"><sub>Explore · Search the collection</sub></td>
  </tr>
  <tr>
    <td colspan="2"><a href="docs/showcase/digital-exhibit.png"><img src="docs/showcase/digital-exhibit.png" alt="河洛数字博物馆 3D 数字展厅" /></a></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub>3D Gallery · 旋转、缩放与多视角观察青铜器数字模型</sub></td>
  </tr>
</table>

## 当前实现

- 前台：馆藏/文章分类浏览、关键词搜索、详情、3D 展厅、预约、注册登录、个人中心、购物车、订单和模拟支付。
- 后台：内容、3D 展项、用户、预约时段与预约、商品、订单、基础统计和操作日志。
- 技术：Vue 3 + TypeScript + Vite、Spring Boot 3（Java 17）、MySQL 8、Flyway、Docker Compose。
- 第一版边界：仅模拟支付；管理员不能公开注册；邮件在本地环境记录为开发邮件日志。

## 项目亮点

- **双语探索**：中文与英文标题、摘要统一进入搜索链路，界面语言切换后仍能连续发现内容。
- **策展式叙事**：主页、Explore 和详情页以器物、主题路径和河洛文化线索组织内容，而不是简单的后台列表。
- **可交互 3D 展厅**：支持模型旋转、缩放、视角切换，并为 WebGL 不可用或移动端场景准备了降级体验。
- **从线上到线下**：浏览馆藏、预约参观、文创商城与模拟支付组成一条完整体验路径。
- **可运营后台**：内容、展项、商品、预约、订单、统计与操作日志均有对应管理能力。

> 本项目为课程演示，商城仅模拟支付。内容包含概念展品与数字重制；部分模型基于 Cleveland Museum of Art 的 CC0 开放资源，具体来源以资产台账和展项说明为准。正式展示前需要核对史实文案和资产授权。

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
