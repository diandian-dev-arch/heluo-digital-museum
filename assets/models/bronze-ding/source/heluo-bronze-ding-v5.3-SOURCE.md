# v5.3 资产来源与处理记录

- 基础网格：Cleveland Museum of Art，`1962.281 Tripod (Ding)`。
- 许可：CC0 Public Domain。
- 原始文件：`source/third-party/cleveland-1962.281/1962.281_tripod_ding.glb`。
- 原始文件 SHA-256：`af0d55ea617c38a62595bb5dbe6c48c56fe76103037c1b5d2ffdfb37e674f8db`。
- 处理脚本：`create_heluo_bronze_ding_v5_3.py`。
- 处理范围：清理无效场景对象、统一展示比例、修复平滑/法线、保留 UV 与器型、网页低模减面；复用原始 CC0 的 Base Color/Normal 细节并进行古铜色重映射、粗糙度和 AO 重制，再制作博物馆灯光。
- 材质：2K Base Color、Normal、Metallic-Roughness、AO；铜绿仅作为凹槽和局部氧化的低饱和色彩，不使用发光材质。
- 网页导出：`export/heluo-bronze-ding-v5.3.glb`，内嵌 WebP 贴图，最终 5,184,352 B（低于 6MB，V14 记录最终大小）。
- 项目贡献：材质重制、贴图、灯光、网页优化与交互由河洛数字博物馆项目完成；本资产不是馆方扫描数据，也不宣称为馆方官方复原。
- 回退：`v5.2` 为当前线上回退版本，`v5.1` 保留为旧版回退版本。
