# 河洛青铜鼎模型资产

## 当前生产边界

- 默认模型：`heluo-bronze-ding-v5.5.glb`，5,213,372 B。
- 人工回退：`heluo-bronze-ding-v5.2.glb`，1,188,980 B。
- `export/` 和 `frontend/public/media/models/` 保留当前 v5.5 与 v5.2 人工回退文件；不提供自动回退逻辑。
- 旧版 Blender 源文件、生成脚本、贴图和验证渲染继续保留，用于版权、来源和制作过程追溯，不作为生产公开副本。

## 来源与许可

v5.5 以 v5.4 为派生源，仅平滑校正正面器腹中轴浮雕下段的右偏，不旋转或改动器身、双耳、三足、材质和来源网格的其他部分。原始模型、URL、下载日期、许可和 SHA-256 记录在 `source/third-party/cleveland-1962.281/SOURCE.md`，派生处理范围见 `source/heluo-bronze-ding-v5.5-SOURCE.md`。

v5.2 是依据 Cleveland Museum of Art `1960.288` CC0 多视图图片重新构建的项目模型。图片清单、哈希和用途说明位于 `reference/cleveland-cma-1960-288/`。

## 文件台账

| 路径 | 用途 |
|---|---|
| `export/heluo-bronze-ding-v5.5.glb` | 当前 Three.js 生产模型，内嵌 WebP PBR 贴图和 glTF `occlusionTexture`。 |
| `export/heluo-bronze-ding-v5.2.glb` | 体积较小的人工回退模型。 |
| `source/heluo-bronze-ding-v5.5.blend` | v5.5 可编辑 Blender 源文件。 |
| `source/fix_heluo_bronze_ding_v5_5_centerline.py` | v5.5 可重复的局部中轴校正脚本。 |
| `source/textures/` | PBR 源贴图。 |
| `source/third-party/cleveland-1962.281/` | v5.4 第三方只读 CC0 源资产与来源记录。 |
| `reference/cleveland-cma-1960-288/` | v5.2 多视图参考及来源清单。 |
| `preview/` | 各阶段正式验证渲染与对比图，不进入生产运行时。 |
| `verify_blend_v5_2.py`、`verify_blend_v5_4.py` | 当前保留版本的源文件/导出验证脚本。 |

## 已验证

- v5.5 GLB 包含 Base Color、Normal、Metallic-Roughness 和 AO/`occlusionTexture`，生产 API 默认返回该模型与 WebP 封面。
- v5.4 与 v5.2 公共 URL 均返回 200，并使用七天媒体缓存。
- 本机生产页面完成桌面与 390px 模拟回归；3D 画布截图和像素检查非空，旋转、缩放、实体/点云及资源释放逻辑保持不变。
- 真实手机触摸、字体渲染和 3D 性能仍待复验。
