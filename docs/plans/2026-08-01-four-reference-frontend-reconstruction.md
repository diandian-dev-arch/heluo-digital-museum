# 2026-08-01 四张参考图前端页面重构

## 目标

以项目组确认的四张桌面端参考图为视觉基准，重构公开首页、数字展项详情、预约与文创商城。保留现有 Vue 路由、公开 API、认证、预约、购物车、订单与 Three.js 交互，不将效果图作为网页背景。

## 关联需求

- F-01 首页与导航
- F-05 数字展项与 3D 交互
- F-06 预约
- F-09 文创商城
- F-10 订单与模拟支付
- F-12 国际化
- N-03 响应式与无障碍基础
- N-06 性能与资源释放

## 视觉基线

1. **首页**：月白回廊、帷幕、远处青铜鼎、左侧策展标题与右侧路线面板。
2. **数字展项**：浅色现代展厅、实体展台、左侧工具条、右侧说明卡与底部导览坞。
3. **预约**：`VISIT PLANNER` 左侧行程选择与右侧参观票据/表单。
4. **商城**：器物工作室式商品陈列、克制分类标签与桌面端常驻购物袋。

## 影响范围

- `frontend/src/views/HomeView.vue`
- `frontend/src/views/ExhibitDetailView.vue`
- `frontend/src/components/ThreeExhibitViewer.vue`
- `frontend/src/views/AppointmentView.vue`
- `frontend/src/views/ShopView.vue`
- `frontend/src/assets/main.css`
- `frontend/public/media/editorial/museum-corridor-hero.png`
- `frontend/public/media/editorial/README.md`

## 实施步骤

1. 在现有全局令牌和导航壳层上追加页面级空间、纸面、月白、墨绿、朱砂与材质规则。
2. 首页改为回廊主视觉、路线行动区与底部策展条；入口仍为真实 RouterLink。
3. 3D 页面保留 Three.js 模型、点云和工具逻辑，仅将场景灯光、展台与信息层改为浅色展厅。
4. 预约页保留时段请求、登录校验、提交与移动端 Sheet；添加行程路径和 SVG 场地图。
5. 商城保留商品/库存/购物车/支付逻辑；改为产品工作室陈列与购物袋侧栏。
6. 用类型检查、单元测试、生产构建和浏览器截图验证；不修改后端接口或数据库。

## 素材与来源

| 素材 | 来源 | 用途 |
|---|---|---|
| `museum-corridor-hero.png` | 2026-08-01 使用内置图像生成工具依据项目组确认的无文字回廊方向自主生成 | 首页环境主视觉。仅作环境图，不含页面文本或交互。 |
| 其他 `editorial` 素材 | 已在同目录素材说明中登记的项目自创资源 | 3D 展厅、预约馆舍和商品/馆藏环境。 |

## 验收标准

- 四页在桌面端保留参考图的主构图、留白、导航、材质、层级与核心组件位置。
- 预约、购物车、支付、国际化、路由和 Three.js 公开方法不回退。
- 390px 下不产生页面横向溢出，保留可达的主要操作。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。

## 风险

- 本地 Vite 的 `/api` 代理默认目标为宿主机 `localhost:8080`，而当前 Docker 后端仅在 Docker 网络内暴露；开发服务器截图不能取得真实异步页面数据。生产 `8088` 仍可用作既有流程验证，最终需在更新的 Docker 前端镜像中复核四页的真实 API 状态。
- Three.js 与字体仍会产生既有的大包提示；本轮没有扩大依赖或后端改动。
