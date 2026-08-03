# v5.4 资产来源与处理记录

- 基础网格：Cleveland Museum of Art，`1962.281 Tripod (Ding)`。
- 许可：CC0 Public Domain。
- 原始文件：`source/third-party/cleveland-1962.281/1962.281_tripod_ding.glb`。
- 原始文件 SHA-256：`af0d55ea617c38a62595bb5dbe6c48c56fe76103037c1b5d2ffdfb37e674f8db`。
- 生成脚本：`source/create_heluo_bronze_ding_v5_4.py`。
- 处理范围：沿用 v5.3 的清理、比例统一、法线修复和网页减面；不重画器型与纹样。使用 Cleveland 源 Base Color/Normal 细节重制中性古青铜颜色、局部暖铜磨损、凹槽铜绿、粗糙度、金属度和 AO。
- 材质：2K Base Color、Normal、Metallic-Roughness、AO；AO 参与 Blender 材质混合并通过 glTF Material Output 导出为 `occlusionTexture`。
- 网页导出：`export/heluo-bronze-ding-v5.4.glb`，内嵌 WebP 贴图，最终 5,213,372 B，低于 6MB。
- 预览：`preview/heluo-bronze-ding-v5.4-cover.png`、`v5.4-front.png`、`v5.4-right.png`、`v5.4-back.png`、`v5.4-top.png`。
- 项目贡献：材质重制、AO、灯光、网页优化与交互由河洛数字博物馆项目完成；本资产不是馆方扫描数据，也不宣称为馆方官方复原。
- 回退：v5.3、v5.2、v5.1 均保留；原始只读文件不修改。
