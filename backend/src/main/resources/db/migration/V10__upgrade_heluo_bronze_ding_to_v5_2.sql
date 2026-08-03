UPDATE exhibits_3d
SET model_url = '/media/models/heluo-bronze-ding-v5.2.glb',
    model_source_ref = 'MODEL-HELUO-BRONZE-DING-V5-2-CMA-CC0',
    model_format = 'GLB',
    model_size_bytes = 1188980,
    cover_image_url = '/media/exhibits/heluo-bronze-ding-v5.2-cover.webp',
    cover_asset_ref = 'IMG-MODEL-HELUO-BRONZE-DING-V5-2',
    summary = '基于 Cleveland Museum of Art CC0 多视图参考重建的河洛青铜鼎，旋转、缩放并近观纹样与器形。',
    description = '这是项目以 Cleveland Museum of Art 开放 CC0 图片为器型参考、在 Blender 中重新建模并重制材质的数字展项，不是馆方扫描数据或官方复原。请拖动模型旋转视角，使用滚轮或双指缩放；若设备不支持 WebGL，仍可查看封面图和文字说明。'
WHERE slug = 'heluo-bronze-ding-3d';
