# 高保真策展页面 Web 素材

- `explore-bronze-ding-user-v2.webp`：当前Explore列表/搜索使用的用户指定暖光深色背景版，原构图不变，960×960，配套320/640/960响应式图。来源为附件8d02df93，源图位于`assets/images/editorial/source/ding-user-20260911/background-v2.png`。v1灰底版已停止用于Explore，保留历史文件。

- 当前首页采用`home-corridor-{dark,light}-user-v2*.webp`：2026-09-11最新两张用户附件，均1672×941，派生640/1280宽与483×941手机居中裁切。无锐化、调色、超分；源图见总台账，v1保留。

- `home-corridor-{dark,light}-user-v1*.webp`：2026-09-11用户提供并授权替换首页背景。深色1672×941，浅色1774×887；640/1280宽及手机居中竖裁切483×941、455×887。仅压缩/缩放/裁切，无额外调色、锐化或超分。源PNG见`assets/images/editorial/source/home-corridor-{dark,light}-user-v1.png`。概念环境图，不作为真实馆舍实拍；旧素材保留。

- `explore-bronze-ding-user-v1.webp`：2026-09-11用户提供并授权接入的AI策展配图，960×960；替换Explore列表/搜索旧鼎封面。响应式320/640/960位于`../responsive/`。原带背景和透明PNG见`assets/images/editorial/source/ding-user-20260911/`，来源边界见图片总台账。

- `bronze-jue-home-{480,960}w-v1.webp`：2026-09-11未采用的候选导出，用户已拒绝，页面未引用、未发布；源图 `assets/images/explore-2026-09-08/soloapi-image2/explore-bronze-jue-clean-v1.png`（1254×1254）。本次SoloAPI生成/编辑请求超时，无新源图。

本目录只保存生产页面直接使用的 WebP。高质量 PNG 源文件位于 `assets/images/editorial/source/`，来源和用途总账见 `assets/images/README.md`。

| 文件 | 用途 |
|---|---|
| `hero-bronze-ding.webp` | 首页透明青铜鼎主视觉。 |
| `heluo-card-atmosphere-image2-v1.webp` | 首页策展卡、馆藏器物卡与文章卡共用的静谧媒体舞台底板；2026-08-10 由用户已登录的 ChatGPT Web Image 2 生成，原始 PNG 导出后压缩为 WebP。 |
| `museum-corridor-hero.webp` | 首页月白回廊环境主视觉。 |
| `museum-corridor-dark-image2.webp` | 首页深色模式夜间回廊环境主视觉；由用户指定的外置浏览器 ChatGPT Plus Image 2 生成，无文字。 |
| `museum-corridor-hero-hd-v2.webp` / `museum-corridor-hero-hd-v2@2x.webp` | 首页月白回廊高密度 1x/2x 环境主视觉（`1586×992` / `3172×1984`）；由已登记浅色构图做无文字细节增强后导出，CSS `image-set()` 按 DPR 选择。 |
| `museum-corridor-dark-image2-hd-v2.webp` / `museum-corridor-dark-image2-hd-v2@2x.webp` | 首页深色模式夜间回廊自然细节 1x/2x 环境主视觉（`1672×941` / `3344×1882`）；沿用原始夜间构图，不额外锐化，桌面按高度缩放以保留完整中心与周围环境，CSS `image-set()` 按 DPR 选择。 |
| `museum-corridor-hero-mobile-portrait-512w-v1.webp` / `museum-corridor-hero-mobile-portrait-1018w-v1.webp` | 首页月白回廊移动端竖向裁切候选（`512×998` / `1018×1984`）；由已登记的浅色 Hero 派生，用于窄屏 `<picture>`，避免横向桌面图按高度过度放大。 |
| `museum-corridor-dark-mobile-portrait-512w-v1.webp` / `museum-corridor-dark-mobile-portrait-966w-v1.webp` | 首页夜间回廊移动端竖向裁切候选（`512×998` / `966×1882`）；由已登记的深色 Hero 派生，用于窄屏 `<picture>`。 |
| `hero-bronze-ding-home-{192,384,640}w-v1.webp` | 首页青铜礼器策展卡响应式缩略图；由 `hero-bronze-ding.webp` 派生，仅用于首页小尺寸卡片。 |
| `heluo-river-map-home-{192,384,640}w-v1.webp` | 首页河洛故事策展卡响应式缩略图；由已登记的 `explore-river-map-stone-user-v2.webp` 派生，仅用于首页小尺寸卡片。 |
| `museum-store-dark-image2-v1.webp` | 商城深色模式夜间文创展台；2026-08-10 由用户已登录的外置 Chrome ChatGPT Web Image 2 生成，`1672x941`，无文字、Logo 或 UI，原始 PNG 以质量 84 压缩为 WebP。 |
| `digital-gallery-hall.webp` | 3D 展项早期白色展厅环境资源。 |
| `exhibit-ding-moonlight.webp` | 数字展厅列表首卡封面。 |
| `museum-exterior-watercolor.webp` | 预约页面馆舍信息卡原始 WebP（`1896x830`），同时作为响应式图片回退源。 |
| `museum-exterior-watercolor-{480,960,1280}w-v1.webp` | 预约馆舍信息卡的版本化响应式候选；由上述原图等比例派生，移动与平板按实际渲染宽度选择，避免首访下载完整原图。 |
| `jade-pig-dragon.webp` | 馆藏策展网格玉器主视觉。 |
| `shop-object-studio.webp` | 商城器物工作室环境；当验证数据缺少封面或摘要时，作为商城真实媒体降级舞台使用。 |
| `explore-river-atmosphere-dark-image2-v1.webp` | Explore 深色页面的河流纹理环境背景；2026-08-11 由用户提供的 Image 2 输出转为 WebP，无文字、Logo 或 UI。 |
| `explore-water-bird-bronze-image2-v1.webp` | Explore 水鸟青铜雕塑卡片媒体；2026-08-11 由用户提供的 Image 2 输出转为 WebP。 |
| `explore-bronze-jue-image2-v1.webp` | Explore 河洛纹青铜爵卡片媒体；2026-08-11 由用户提供的 Image 2 输出转为 WebP。 |
| `explore-jade-bi-image2-v1.webp` | Explore 河图玉璧卡片媒体；2026-08-11 由用户提供的 Image 2 输出转为 WebP。 |
| `explore-painted-pottery-jar-image2-v1.webp` | Explore 彩陶水纹罐卡片媒体；2026-08-11 由用户提供的 Image 2 输出转为 WebP。 |
| `explore-river-map-stone-image2-v1.webp` | Explore 河洛图纹石板卡片媒体；2026-08-11 由用户提供的 Image 2 输出转为 WebP。 |
| `explore-reference-ink-river-imagegen-v1.webp` | Explore 完整桌面参考对应的深墨河流环境底图；2026-08-11 由内置 imagegen 生成，无文字、Logo 或 UI。 |
| `explore-jade-bi-light-imagegen-v1.webp` | Explore 右侧玉璧高卡的旧浅色石灰岩媒体舞台；2026-08-11 由内置 imagegen 基于既有玉璧图生成，无文字、Logo 或 UI；仅保留作历史参考，不再用于双主题卡片。 |
| `explore-jade-bi-dark-user-v1.webp` | Explore 河图玉璧右侧高卡的最终深墨媒体；2026-08-12 采用用户提供的 `1254×1254` PNG，转换为同尺寸 WebP（quality 88），经主体完整性、暗色融合、比例、裁切与文字/Logo/水印检查为 `PASS`，浅色与深色主题共用。 |
| `explore-water-bird-bronze-user-v2.webp` | Explore 最终还原版水鸟青铜雕塑媒体；2026-08-13 由用户重新提供的 `1254×1254` PNG 转为 WebP。 |
| `explore-bronze-jue-user-v2.webp` | Explore 最终还原版河洛纹青铜爵媒体；2026-08-13 由用户重新提供的 `1254×1254` PNG 转为 WebP。 |
| `explore-jade-bi-user-v2.webp` | Explore 最终还原版河图玉璧媒体，并复用于第一张专题阅读卡；2026-08-13 由用户重新提供的 `1254×1254` PNG 转为 WebP。 |
| `explore-painted-pottery-jar-user-v2.webp` | Explore 最终还原版彩陶水纹罐媒体；2026-08-13 由用户重新提供的 `1254×1254` PNG 转为 WebP。 |
| `explore-river-map-stone-user-v2.webp` | Explore 最终还原版河洛图纹石板媒体，并复用于第二张专题阅读卡；2026-08-13 由用户重新提供的 `1254×1254` PNG 转为 WebP。 |
| `explore-card-panel-user-v2.webp` | Explore 五件馆藏卡的深墨外框底板；2026-08-13 由用户提供的无网页文字底板转为 WebP。 |
| `explore-object-stage-user-v2.webp` | Explore 竖向器物展台底板；2026-08-13 由用户提供的无网页文字底板转为 WebP。 |
| `explore-info-panel-user-v2.webp` | Explore 横向信息栏墨玉纹理；2026-08-13 由用户提供的无网页文字底板转为 WebP。 |
| `explore-theme-path-cloud-divider-user-v1.webp` | Explore 主题脉络左侧标题下方的金色云纹；用户透明 PNG 裁切压缩，无文字。 |
| `explore-theme-path-vertical-divider-user-v1.webp` | Explore 主题脉络左右区域的金色花结分隔；用户透明 PNG 裁切压缩，无文字。 |
| `explore-theme-path-river-user-v1.webp` | Explore 主题脉络右侧青玉河线；用户透明 PNG 裁切压缩，五个可读标签仍由 Vue DOM 渲染。 |
| `explore-theme-path-wave-ornament-user-v1.webp` | Explore 主题脉络左下金色波浪角饰；用户透明 PNG 裁切压缩，无文字。 |
| `explore-theme-path-compass-user-v1.webp` | Explore 主题脉络中央节点罗盘纹饰；用户透明 PNG 裁切压缩，无文字。 |
| `explore-theme-path-mountains-user-v1.webp` | Explore 主题脉络底部水墨山峦；用户透明 PNG 裁切压缩，无文字。 |
| `explore-theme-path-bamboo-user-v1.webp` | Explore 主题脉络右侧竹影；用户透明 PNG 裁切压缩，无文字。 |

所有图片均不包含页面可读文字，只承担主视觉或环境展示；文本、交互和业务数据由 Vue、API 与 Three.js 渲染。当前 3D 生产模型为 `frontend/public/media/models/heluo-bronze-ding-v5.5.glb`，v5.2 仅作人工回退。
