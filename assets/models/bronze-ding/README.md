# 河洛青铜鼎模型资产

## 当前生产边界

- 默认模型：`heluo-bronze-ding-v5.5.glb`，5,213,372 B。
- 移动 LOD：`heluo-bronze-ding-v5.5-mobile.glb`，837,720 B；SHA-256 `1EE1598ADF5F719B70DC3889A9D057E693702F9426BC18AAA4E270A80C92AB29`。
- 人工回退：`heluo-bronze-ding-v5.2.glb`，1,188,980 B。
- `export/` 和 `frontend/public/media/models/` 保留当前 v5.5、v5.5 移动 LOD 与 v5.2 人工回退文件。受限性能档优先使用 API 返回的移动 LOD；移动字段为空时回退 v5.5 默认模型，v5.2 仍只用于人工回退。
- 旧版 Blender 源文件、生成脚本、贴图和验证渲染继续保留，用于版权、来源和制作过程追溯，不作为生产公开副本。

## 来源与许可

v5.5 以 v5.4 为派生源，仅平滑校正正面器腹中轴浮雕下段的右偏，不旋转或改动器身、双耳、三足、材质和来源网格的其他部分。原始模型、URL、下载日期、许可和 SHA-256 记录在 `source/third-party/cleveland-1962.281/SOURCE.md`，派生处理范围见 `source/heluo-bronze-ding-v5.5-SOURCE.md`。

v5.5 移动 LOD 直接由 `export/heluo-bronze-ding-v5.5.glb` 派生，不引入新的器型、纹样或授权来源。GLB 元数据显示生成器为 glTF-Transform v4.4.2；产物包含 1 个网格/图元、54,655 个顶点、224,748 个索引和三张 1024×1024 WebP PBR 纹理，要求 `EXT_meshopt_compression`、`EXT_texture_webp` 与 `KHR_mesh_quantization`，并保留 `KHR_materials_clearcoat`、Base Color、Normal、Metallic-Roughness 和 AO/`occlusionTexture`。

本轮没有保留独立生成脚本或可证明的精确 CLI 命令，不能仅凭产物反推具体简化参数。后续资产治理需补充可重复生成脚本和参数锁定；本文件当前只记录可由 GLB、文件哈希和校验工具复验的结果。

v5.2 是依据 Cleveland Museum of Art `1960.288` CC0 多视图图片重新构建的项目模型。图片清单、哈希和用途说明位于 `reference/cleveland-cma-1960-288/`。

## 文件台账

| 路径 | 用途 |
|---|---|
| `export/heluo-bronze-ding-v5.5.glb` | 当前 Three.js 生产模型，内嵌 WebP PBR 贴图和 glTF `occlusionTexture`。 |
| `export/heluo-bronze-ding-v5.5-mobile.glb` | 移动 LOD 归档副本；1 个网格/图元、54,655 个顶点、74,916 个三角形，使用 `EXT_meshopt_compression` 与 `KHR_mesh_quantization`。 |
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
- 移动 LOD 从桌面版的 5,213,372 B、136,214 个三角形降至 837,720 B、74,916 个三角形，文件体积减少约 83.9%；归档副本与前端公开副本的大小和 SHA-256 完全一致。
- glTF-Transform v4.4.2 `validate` 检查为 0 个错误、0 个警告；校验器另报告 1 条信息，说明其无法验证 `EXT_meshopt_compression` 扩展本身。Blender 5.2 LTS 已成功重新导入移动 GLB，得到 1 个网格、1 个材质和 3 张贴图。
- v5.4 与 v5.2 公共 URL 均返回 200，并使用七天媒体缓存。
- 本机生产页面完成桌面与 390px 模拟回归；3D 画布截图和像素检查非空，旋转、缩放、实体/点云及资源释放逻辑保持不变。
- v5.5 移动 LOD 在新 Docker 页面中的 Meshopt 解码、真实手机触摸、画质、首帧和帧率仍待复验。
