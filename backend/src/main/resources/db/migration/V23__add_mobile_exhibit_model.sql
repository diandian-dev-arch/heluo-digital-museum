ALTER TABLE exhibits_3d ADD COLUMN mobile_model_url VARCHAR(500) NULL;
ALTER TABLE exhibits_3d ADD COLUMN mobile_model_size_bytes BIGINT UNSIGNED NULL;

UPDATE exhibits_3d
SET mobile_model_url = '/media/models/heluo-bronze-ding-v5.5-mobile.glb',
    mobile_model_size_bytes = 837720
WHERE slug = 'heluo-bronze-ding-3d';
