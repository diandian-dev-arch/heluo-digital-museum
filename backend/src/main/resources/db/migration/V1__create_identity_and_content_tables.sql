CREATE TABLE roles (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_roles PRIMARY KEY (id),
  CONSTRAINT uq_roles_code UNIQUE (code),
  CONSTRAINT uq_roles_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(20) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_phone UNIQUE (phone),
  CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED')),
  INDEX idx_users_status_deleted_at (status, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id TINYINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id),
  CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id),
  INDEX idx_user_roles_role_user (role_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255) NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_categories PRIMARY KEY (id),
  CONSTRAINT uq_categories_code UNIQUE (code),
  CONSTRAINT uq_categories_name UNIQUE (name),
  INDEX idx_categories_enabled_sort (enabled, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  accession_no VARCHAR(64) NULL,
  title VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  period VARCHAR(100) NULL,
  material VARCHAR(100) NULL,
  dimensions VARCHAR(150) NULL,
  collection_location VARCHAR(150) NULL,
  cover_image_url VARCHAR(500) NULL,
  cover_asset_ref VARCHAR(128) NULL,
  summary VARCHAR(500) NULL,
  content LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  published_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_artifacts PRIMARY KEY (id),
  CONSTRAINT uq_artifacts_accession_no UNIQUE (accession_no),
  CONSTRAINT uq_artifacts_slug UNIQUE (slug),
  CONSTRAINT fk_artifacts_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_artifacts_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_artifacts_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT fk_artifacts_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id),
  CONSTRAINT chk_artifacts_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  INDEX idx_artifacts_visibility (status, deleted_at, published_at, id),
  INDEX idx_artifacts_category_visibility (category_id, status, deleted_at, published_at, id),
  INDEX idx_artifacts_period (period), INDEX idx_artifacts_cover_asset_ref (cover_asset_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL, slug VARCHAR(220) NOT NULL,
  cover_image_url VARCHAR(500) NULL, cover_asset_ref VARCHAR(128) NULL,
  summary VARCHAR(500) NOT NULL, content LONGTEXT NOT NULL, author_display VARCHAR(100) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', published_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NOT NULL, updated_by BIGINT UNSIGNED NOT NULL,
  deleted_at DATETIME(3) NULL, deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_articles PRIMARY KEY (id), CONSTRAINT uq_articles_slug UNIQUE (slug),
  CONSTRAINT fk_articles_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_articles_created_by FOREIGN KEY (created_by) REFERENCES users (id), CONSTRAINT fk_articles_updated_by FOREIGN KEY (updated_by) REFERENCES users (id), CONSTRAINT fk_articles_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id),
  CONSTRAINT chk_articles_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  INDEX idx_articles_visibility (status, deleted_at, published_at, id), INDEX idx_articles_category_visibility (category_id, status, deleted_at, published_at, id), INDEX idx_articles_cover_asset_ref (cover_asset_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exhibits_3d (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, artifact_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL, slug VARCHAR(180) NOT NULL, summary VARCHAR(500) NULL, description LONGTEXT NULL,
  model_url VARCHAR(500) NOT NULL, model_source_ref VARCHAR(128) NOT NULL, model_format VARCHAR(16) NOT NULL DEFAULT 'GLB', model_size_bytes BIGINT UNSIGNED NOT NULL,
  cover_image_url VARCHAR(500) NULL, cover_asset_ref VARCHAR(128) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', published_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NOT NULL, updated_by BIGINT UNSIGNED NOT NULL, deleted_at DATETIME(3) NULL, deleted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_exhibits_3d PRIMARY KEY (id), CONSTRAINT uq_exhibits_3d_slug UNIQUE (slug), CONSTRAINT uq_exhibits_3d_model_source_ref UNIQUE (model_source_ref),
  CONSTRAINT fk_exhibits_3d_artifact FOREIGN KEY (artifact_id) REFERENCES artifacts (id),
  CONSTRAINT fk_exhibits_3d_created_by FOREIGN KEY (created_by) REFERENCES users (id), CONSTRAINT fk_exhibits_3d_updated_by FOREIGN KEY (updated_by) REFERENCES users (id), CONSTRAINT fk_exhibits_3d_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id),
  CONSTRAINT chk_exhibits_3d_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  CONSTRAINT chk_exhibits_3d_format CHECK (model_format IN ('GLB', 'GLTF')),
  INDEX idx_exhibits_3d_visibility (status, deleted_at, published_at, id), INDEX idx_exhibits_3d_artifact_visibility (artifact_id, status, deleted_at, published_at, id), INDEX idx_exhibits_3d_cover_asset_ref (cover_asset_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (code, name, description) VALUES
  ('USER', '普通用户', '已注册的参观与购买用户'),
  ('ADMIN', '管理员', '第一版唯一的后台管理账号');
