# 图片素材台账

- 2026-09-11 青铜鼎背景第二版：用户附件`codex-clipboard-8d02df93-2689-48a0-9ff1-01b474c0b37c.png`，1254×1254，原图归档`editorial/source/ding-user-20260911/background-v2.png`。按用户指定替换v1灰底版，完整保留构图、背景和布光；生成`explore-bronze-ding-user-v2`主图及响应式WebP。仍为用户提供AI策展配图，不代表原件照片或模型实拍；授权边界同下方原记录，旧文件保留。

- 2026-09-11首页背景第二版：用户最新附件a5e1ae09（深色）、f696c3f9（浅色）归档至`editorial/source/home-corridor-{dark,light}-user-v2.png`，均1672×941。用户授权用于首页的概念环境图，不作为馆舍实拍；保留第一版。

## 2026-09-11 用户首页背景

- 用户明确要求附件af151efd用于深色、c0b61098用于浅色首页。原PNG归档至`editorial/source/home-corridor-dark-user-v1.png`及`home-corridor-light-user-v1.png`，不覆盖旧源图。用户提供的概念场景，不声称真实馆舍或额外版权认证；网页派生仅做WebP编码、缩小和手机居中裁切。

## 2026-09-11 用户提供青铜鼎策展配图

- 来源：用户自行生成并明确要求替换；两份原图归档于 `editorial/source/ding-user-20260911/background.png` 与 `transparent.png`，对应附件791e95a9与65875b19。原文件保留，不覆盖。
- 使用：带背景版供探索馆藏列表及搜索；透明版仅归档。作为AI策展配图，不代表Cleveland原件照片或项目3D模型实拍；不继承原模型CC0声明，生成服务和授权细则未独立核验。
- 处理：外围背景扩展至1370方形，主体约74%高度，保留器物及接触阴影；WebP导出960主图与320/640/960响应式版本。

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

## 首页回廊高密度媒体（2026-08-14）

- 为修复首页 Hero 在高 DPR 显示器上的背景模糊，新增非破坏性的细节增强源图 `source/museum-corridor-hero-hd-v2.png`（`1586×992`）和 `source/museum-corridor-dark-image2-hd-v2.png`（`1672×941`）。两张源图均保持既有浅色/深色回廊构图，不含网页文字、Logo 或 UI。
- 浅色源图经内置 ImageGen 做细节恢复；深色源图沿用已确认的原始夜间回廊，不再额外锐化或提亮。两者均以 1x/2x WebP 导出到 `frontend/public/media/editorial/`；页面通过 CSS `image-set()` 按设备像素比选择资源，原有生产文件仍保留作回退。

## Explore 最终还原素材（2026-08-13）

- 用户重新提供的五件概念展品图与三张卡片底板原图保存在 `assets/images/explore-2026-08-13/`，均为 `1254 x 1254` PNG。
- 五件概念展品分别为水鸟青铜雕塑、河洛纹青铜爵、河图玉璧、彩陶水纹罐和河洛图纹石板；三张底板分别承担外框、竖向器物舞台和横向信息栏纹理。
- 完整效果图与改版前截图归档在 `docs/design/image2/2026-08-13/outputs/`，只用于 `1672 x 941` 视觉验收，不作为运行时整图。
- 生产页面只引用 `frontend/public/media/editorial/` 下对应的 `explore-*-user-v2.webp`，不覆盖旧版素材；页面文字、编号、筛选和链接继续由 Vue/CSS 渲染。

## Explore 主题脉络参考素材（2026-08-15）

- 用户提供的金色云纹/花结、青玉河线、金色角饰/罗盘、水墨山峦/竹影、空白卡片和完整效果图共九张输入，完整归档于 `assets/images/explore-2026-08-15/theme-path-reference/`。
- `theme-path-full-reference.png`（`1672 x 941`）与空白卡片只作为视觉合同，不进入运行时；页面没有把带文字的效果图直接铺成背景。
- 七张透明装饰源经裁切、缩放和 WebP 压缩后发布到 `frontend/public/media/editorial/`。品牌、标题、说明和五个主题标签继续由真实 Vue DOM 渲染，并支持中英文与响应式重排。

## 点云展项视觉基准（2026-08-01）

数字展厅的两张点云预览图已登记在 `assets/design-mockups/2026-08-01-threejs-pointcloud-exhibit/`。它们由项目组使用 Codex 图像生成功能自主创作，仅作为实时 Three.js 场景、粒子聚合动画和界面布局的视觉验收参考；不作为运行时背景图，也不宣称为真实博物馆摄影。
# 2026-09-11 首页青铜爵素材复用

既有 `explore-2026-09-08/soloapi-image2/explore-bronze-jue-clean-v1.png` 的480/960px候选导出已被用户拒绝，未引用或发布。新青铜觚及鼎精修请求均响应超时，无新图交付。
