UPDATE exhibits_3d
SET model_url = '/media/models/heluo-bronze-ding-v5.3.glb',
    model_source_ref = 'MODEL-HELUO-BRONZE-DING-V5-3-CMA-1962-281-CC0',
    model_format = 'GLB',
    model_size_bytes = 5054436,
    cover_image_url = '/media/exhibits/heluo-bronze-ding-v5.3-cover.webp',
    cover_asset_ref = 'IMG-MODEL-HELUO-BRONZE-DING-V5-3',
    summary = '基于 Cleveland Museum of Art 1962.281 CC0 鼎模型并重制古青铜材质的数字展项，支持旋转、缩放和近观纹样。',
    description = '本展项以 Cleveland Museum of Art 1962.281 Tripod (Ding) 的 CC0 模型为基础网格，由项目完成法线清理、网页减面、古青铜 PBR 材质和展厅灯光优化，不是馆方扫描数据或官方复原。请拖动模型旋转视角，使用滚轮或双指缩放；若设备不支持 WebGL，仍可查看封面图和文字说明。'
WHERE slug = 'heluo-bronze-ding-3d';
