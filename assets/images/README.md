# 图片素材台账

本目录的图片均为项目自主创作的最终展示素材；项目组已于 2026-08-01 确认可用于第一版展示。其名称和展签内容须在后续资料核对后确定，不能将其描述为任何真实馆藏。

| 分类 | 文件 | 建议用途 | 尺寸 | 原始大小 |
|---|---|---|---:|---:|
| 文物 | `exhibits/jade-bi-cover.png` | 玉璧卡片 | 1254 x 1254 | 1.88 MB |
| 文物 | `exhibits/painted-pottery-jar-cover.png` | 彩陶罐卡片 | 1254 x 1254 | 2.15 MB |
| 文物 | `exhibits/bronze-jue-cover.png` | 青铜爵卡片 | 1254 x 1254 | 2.36 MB |
| 文物 | `exhibits/river-map-stone-cover.png` | 河洛图纹石板卡片 | 1254 x 1254 | 2.60 MB |
| 文物 | `exhibits/water-bird-bronze-cover.png` | 水鸟青铜雕塑卡片 | 1254 x 1254 | 2.26 MB |
| 文创 | `products/heluo-silk-scarf.png` | 河洛水系丝巾商品卡 | 1254 x 1254 | 2.35 MB |
| 文创 | `products/river-map-notebook.png` | 河图纹笔记本商品卡 | 1254 x 1254 | 2.72 MB |
| 文创 | `products/river-line-teacup-set.png` | 河流纹茶杯套装商品卡 | 1254 x 1254 | 1.69 MB |

接入页面前：按实际展示尺寸导出 WebP/AVIF，使用响应式图片和懒加载；保留本 PNG 作为高质量源图。

## 方案 B 高保真页面素材（2026-08-01）

首页透明青铜鼎、3D 白色展厅、预约馆舍水墨图和馆藏玉器等新增自创 Web 资源位于 `frontend/public/media/editorial/`，处理方式与用途登记在该目录的 `README.md`。这些资源只承担主视觉或环境展示，不替代页面 DOM、API 数据或 Three.js 模型。

## Web 性能导出（2026-08-02）

- 首页回廊、展厅封面和商城背景的高质量 PNG 源文件保存在 `assets/images/editorial/source/`。
- 生产目录只发布对应 WebP：`museum-corridor-hero.webp`、`exhibit-ding-moonlight.webp`、`shop-object-studio.webp`。
- v5.4 3D 降级封面发布为 `frontend/public/media/exhibits/heluo-bronze-ding-v5.4-cover.webp`；正式 PNG 渲染保留在模型 `preview/` 目录。

## 点云展项视觉基准（2026-08-01）

数字展厅的两张点云预览图已登记在 `assets/design-mockups/2026-08-01-threejs-pointcloud-exhibit/`。它们由项目组使用 Codex 图像生成功能自主创作，仅作为实时 Three.js 场景、粒子聚合动画和界面布局的视觉验收参考；不作为运行时背景图，也不宣称为真实博物馆摄影。
