-- Correct the published asset byte size after the final neutral aged-bronze lighting/material balance.
UPDATE exhibits_3d
SET model_size_bytes = 5184352
WHERE slug = 'heluo-bronze-ding-3d'
  AND model_source_ref = 'MODEL-HELUO-BRONZE-DING-V5-3-CMA-1962-281-CC0';
