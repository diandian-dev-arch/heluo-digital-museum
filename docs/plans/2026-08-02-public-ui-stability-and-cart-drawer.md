# 2026-08-02 前台细节稳定性与商城购物袋修复

## 目标

根据浏览器标注，修复公开首页导航材质和英文标题缩放碰撞、馆藏展项封面、数字展厅刷新时的过曝首帧，并把桌面商城购物车重构为参考图中的右侧抽屉式购物袋。

## 关联需求

F-01、F-02、F-05、F-09、F-10、F-12、N-03、N-06。

## 影响范围

- `frontend/src/assets/main.css`
- `frontend/src/views/HomeView.vue`
- `frontend/src/views/ExhibitsView.vue`
- `frontend/src/components/ThreeExhibitViewer.vue`
- `frontend/public/media/editorial/exhibit-ding-moonlight.png`

## 实施与验收

1. 导航改为灰绿半透明材质，仍保留可读性和 sticky 行为。
2. 英文首页标题单独采用安全的字距、行高、断行与宽度规则，缩放时不重叠。
3. 3D 默认直接呈现实体模型，压低灯光/曝光，取消刷新首帧的点云聚合闪白。
4. 特定青铜鼎卡片使用自创月白展厅封面；其余 API 数据不变。
5. 桌面商城保持真实商品、库存、数量、移除与结算逻辑，视觉调整为右侧购物袋抽屉。
6. 运行类型检查、单测、构建与桌面截图；不修改后端接口或数据结构。
