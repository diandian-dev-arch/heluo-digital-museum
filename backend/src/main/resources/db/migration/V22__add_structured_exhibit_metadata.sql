ALTER TABLE exhibits_3d ADD COLUMN display_no VARCHAR(32) NULL;
ALTER TABLE exhibits_3d ADD COLUMN source_credit VARCHAR(255) NULL;
ALTER TABLE exhibits_3d ADD COLUMN source_url VARCHAR(500) NULL;
ALTER TABLE exhibits_3d ADD COLUMN license_label VARCHAR(128) NULL;
ALTER TABLE exhibits_3d ADD COLUMN collection_location VARCHAR(255) NULL;

UPDATE exhibits_3d
SET display_no = '06',
    source_credit = 'Cleveland Museum of Art · 1962.281 CC0 reference',
    source_url = 'https://www.clevelandart.org/art/1962.281',
    license_label = 'CC0 reference · project reconstruction',
    collection_location = '河洛数字博物馆 · 深墨青铜厅'
WHERE slug = 'heluo-bronze-ding-3d';
