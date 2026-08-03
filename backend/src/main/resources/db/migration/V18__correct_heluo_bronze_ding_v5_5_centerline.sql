-- Publish the v5.5 derivative with a locally straightened front center relief.
UPDATE exhibits_3d
SET model_url = '/media/models/heluo-bronze-ding-v5.5.glb',
    model_source_ref = 'MODEL-HELUO-BRONZE-DING-V5-5-CMA-1962-281-CC0-CENTERLINE-FIX',
    model_format = 'GLB',
    model_size_bytes = 5213372
WHERE slug = 'heluo-bronze-ding-3d';
