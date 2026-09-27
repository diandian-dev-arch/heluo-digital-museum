# 响应式媒体派生清单

日期：2026-09-08。18 张已登记源图，54 个 WebP 派生文件。仅等比例缩小，不裁切、不改色、不覆盖原图；原生 960px 图片直接复制至 960w 版本，避免重复有损编码。

## 来源与许可

- `explore-*-user-v2`：用户于 2026-08-13 提供的概念展品图，既有 WebP 位于 `../editorial/`；原始登记见该目录 README 与 `assets/images/README.md`。沿用项目展示用途，未取得或声明新的开放许可，不将概念图片标作真实馆藏摄影。
- `shop-object-studio`、`hero-bronze-ding`、`jade-pig-dragon`、`exhibit-ding-moonlight`：项目已登记的自主创作展示素材，来源为 `../editorial/` 中同名 WebP；用途与授权边界沿用原台账。
- `water-bird-bronze-cover`、`bronze-jue-cover`、`jade-bi-cover`、`painted-pottery-jar-cover`、`river-map-stone-cover`：项目于 2026-08-01 确认展示用途的概念文物图，来源为 `../exhibits/` 中同名 WebP，PNG 源登记在 `assets/images/README.md`。
- 三张商品图：项目原创概念文创展示素材，来源为 `../products/` 中同名 WebP，PNG 源为 `assets/images/products/`，不表示已有实物库存或真实销售。
- `heluo-bronze-ding-v5.4-cover`：项目 v5.4 模型预览，来源为 `../exhibits/` 中同名 WebP；底模来自 Cleveland Museum of Art `1962.281`，CC0 Public Domain，详见 `assets/models/bronze-ding/source/third-party/cleveland-1962.281/SOURCE.md`。保留原有署名和派生来源，不归入原创概念文物图。

## 尺寸与体积

文件名为下表名称加 `-{320,640,960}w.webp`；宽度分别为 320、640、960px，高度按原图比例取最接近的整数。大小单位为字节。

| 名称 | 原图尺寸 | 原图 | 320w | 640w | 960w |
|---|---:|---:|---:|---:|---:|
| explore-water-bird-bronze-user-v2 | 1254x1254 | 168828 | 6514 | 27478 | 61506 |
| explore-bronze-jue-user-v2 | 1254x1254 | 174210 | 6992 | 28622 | 62892 |
| explore-jade-bi-user-v2 | 1254x1254 | 199554 | 10006 | 39086 | 82596 |
| explore-painted-pottery-jar-user-v2 | 1254x1254 | 147832 | 7690 | 25996 | 53430 |
| explore-river-map-stone-user-v2 | 1254x1254 | 234222 | 9844 | 43812 | 96648 |
| shop-object-studio | 1536x1024 | 111180 | 9246 | 26738 | 53090 |
| hero-bronze-ding | 991x947 | 313664 | 35558 | 123106 | 236332 |
| jade-pig-dragon | 1254x1254 | 124644 | 5344 | 19006 | 40496 |
| exhibit-ding-moonlight | 1448x1086 | 79698 | 5622 | 18050 | 39258 |
| water-bird-bronze-cover | 960x960 | 65450 | 8712 | 32216 | 65450 |
| bronze-jue-cover | 960x960 | 83192 | 10832 | 41668 | 83192 |
| jade-bi-cover | 960x960 | 50412 | 9304 | 29070 | 50412 |
| painted-pottery-jar-cover | 960x960 | 74250 | 10496 | 37982 | 74250 |
| river-map-stone-cover | 960x960 | 98842 | 11816 | 48308 | 98842 |
| heluo-bronze-ding-v5.4-cover | 980x1180 | 30318 | 7238 | 16704 | 27220 |
| river-line-teacup-set | 960x960 | 24360 | 3962 | 10986 | 24360 |
| heluo-silk-scarf | 960x960 | 81520 | 13802 | 42282 | 81520 |
| river-map-notebook | 960x960 | 117156 | 11990 | 50838 | 117156 |
| 合计 | 18 张原图 | 2179332 | 184968 | 661948 | 1348650 |

同一组 18 张图按 640w 交付比原图减少约 69.6%；五张 Explore 图片由 924646B 降至 164994B，约减少 82.2%。浏览器按实际 `sizes`、视口与 DPR 选图，这些数字不等同于每次页面加载实测节省量。54 个文件合计 2195566B，为磁盘/发布包新增体积，不会全部随页面下载。

## 生成与校验

唯一映射清单为 `frontend/src/lib/responsiveMediaManifest.json`。页面通过 `mediaSrcset(src)` 读取已登记路径；未知 CMS 地址不生成假定的派生路径，继续使用原图。

```powershell
python frontend/scripts/generate-responsive-media.py
python frontend/scripts/generate-responsive-media.py --check
```

本轮使用已安装的 Pillow 12.2.0，LANCZOS、WebP quality 85、method 6，保留透明通道。校验逐张解码、核对宽高和 WebP 格式；生成脚本不是前端运行时依赖。
