-- Switch the published exhibition to the source-preserving v5.4 museum bronze candidate.
UPDATE exhibits_3d
SET model_url = '/media/models/heluo-bronze-ding-v5.4.glb',
    model_source_ref = 'MODEL-HELUO-BRONZE-DING-V5-4-CMA-1962-281-CC0',
    model_format = 'GLB',
    model_size_bytes = 5213372,
    cover_image_url = '/media/exhibits/heluo-bronze-ding-v5.4-cover.png',
    cover_asset_ref = 'IMG-MODEL-HELUO-BRONZE-DING-V5-4',
    summary = '基于 Cleveland Museum of Art 1962.281 CC0 鼎模型，保留原始器型与纹样并重制真实古青铜 PBR 材质的数字展项，支持旋转、缩放和近观纹样。',
    description = '本展项以 Cleveland Museum of Art 1962.281 Tripod (Ding) 的 CC0 模型为基础网格，保留原始器型与纹样，由项目完成法线、AO、粗糙度、金属度和局部氧化铜绿重制，并使用深色博物馆顶光展厅呈现。该版本不是馆方扫描数据或官方复原。请拖动模型旋转视角，使用滚轮或双指缩放；若设备不支持 WebGL，仍可查看封面图和文字说明。'
WHERE slug = 'heluo-bronze-ding-3d';
