-- Keep the current v5.4 exhibit while serving its compressed WebP fallback cover.
UPDATE exhibits_3d
SET cover_image_url = '/media/exhibits/heluo-bronze-ding-v5.4-cover.webp'
WHERE slug = 'heluo-bronze-ding-3d'
  AND cover_image_url = '/media/exhibits/heluo-bronze-ding-v5.4-cover.png';
