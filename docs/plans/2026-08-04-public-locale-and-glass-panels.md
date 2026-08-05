# 公共前台英文覆盖与玻璃看板统一计划

## 目标

补齐英文模式下首页、数字展项、预约、个人中心和全局导航的中文残留，并统一首页路线、展项信息、个人中心三张深色毛玻璃卡及预约左右看板的视觉细节。

## 关联需求

- F-01/F-05/F-06/F-08：公共浏览、数字展项、预约与账户
- N-03：易用性、响应式与无障碍
- N-06：可维护性和前端验证

## 影响范围

- `frontend/src/App.vue`
- `frontend/src/views/HomeView.vue`
- `frontend/src/views/ExhibitDetailView.vue`
- `frontend/src/views/AppointmentView.vue`
- `frontend/src/views/ProfileView.vue`
- `frontend/src/views/ExploreView.vue`
- `frontend/src/views/ExhibitsView.vue`
- `frontend/src/views/ShopView.vue`
- `frontend/src/views/LoginView.vue`
- `frontend/src/components/CartPanelContent.vue`
- `frontend/src/components/ThreeExhibitViewer.vue`
- `frontend/src/assets/main.css`

不修改 API、用户数据、预约状态、3D 模型、点云状态机或权限逻辑。

## 实施步骤

1. 为全局壳层和四个目标页面建立完整的中英文静态文案映射。
2. 将标题、ARIA、占位符、状态提示、路线 SVG、按钮和移动端文案接入语言状态。
3. 统一三张深色玻璃卡的圆角、边缘高光、模糊、阴影、标题与操作控件。
4. 统一预约左右看板的浅色玻璃层级、分隔和输入区域。
5. 运行测试、类型检查、生产构建、Docker 和中英文桌面/手机浏览器回归。

## 验收标准

- 英文模式下目标页面不再出现静态中文界面文案。
- 用户昵称、展品 API 内容等动态数据不被错误改写。
- 三张深色卡材质细节一致，预约左右看板属于同一浅色玻璃体系。
- 桌面与 `390x844` 无横向溢出或文本截断，控制台无新增错误。

## 验证结果

- 已补齐首页、馆藏、数字展厅列表与详情、预约、商城、登录、个人中心及全局壳层的英文静态文案；首批馆藏、文章、展项和商品使用稳定 slug/name 的英文展示映射，数据库原文与用户动态资料未改动。
- 首页路线卡、展项信息卡、个人中心卡统一为墨玉玻璃材质；预约左右看板统一为月白玻璃材质，并保持 `8px` 圆角、边缘高光、阴影和控件尺度一致。
- `corepack pnpm typecheck` 通过；`corepack pnpm test -- --run` 通过，11 个测试文件共 39 项；`corepack pnpm build` 通过。仅保留既有 VueUse PURE 注释和 Three.js chunk 大小提示。
- Docker 前端镜像重建并重新创建容器，`http://localhost:8088/` 返回 HTTP `200`。
- 正式页面在 `1433x746` 与 `390x844` 检查 `/`、`/explore`、`/exhibits`、展项详情、`/appointment`、`/shop`、`/login`、`/profile`：英文模式仅保留用于切回中文的“中文”按钮，所有路由 `scrollWidth === clientWidth`。
- 3D 页面 `data-render-state=running`；手机实体/点云分段标签无溢出并独立换行显示。控制台未发现新增错误。
