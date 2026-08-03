# v5.5 资产来源与局部校正记录

- 派生源：`source/heluo-bronze-ding-v5.4.blend`，其基础网格来自 Cleveland Museum of Art `1962.281 Tripod (Ding)`，CC0 Public Domain。
- 原始下载文件：`source/third-party/cleveland-1962.281/1962.281_tripod_ding.glb`。
- 原始文件 SHA-256：`af0d55ea617c38a62595bb5dbe6c48c56fe76103037c1b5d2ffdfb37e674f8db`。
- 校正脚本：`source/fix_heluo_bronze_ding_v5_5_centerline.py`。
- 处理范围：仅对正面 `-Y` 器腹中轴浮雕下段使用平滑权重沿 `X` 轴向左微调，最大位移 `0.022` Blender 单位，以消除网页正视图可见的右偏；器身、双耳、三足、背面、材质、贴图和原始只读文件不修改。
- 网页导出：`export/heluo-bronze-ding-v5.5.glb`，内嵌 WebP PBR 贴图，5,213,372 B。
- 回退：v5.4 与 v5.2 文件保留；原始第三方 GLB 不修改。
