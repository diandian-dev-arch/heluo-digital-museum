-- Correct the published asset byte size after the v5.3 source-texture material refresh.
UPDATE exhibits_3d
SET model_size_bytes = 5241740
WHERE slug = 'heluo-bronze-ding-3d'
  AND model_source_ref = 'MODEL-HELUO-BRONZE-DING-V5-3-CMA-1962-281-CC0';
