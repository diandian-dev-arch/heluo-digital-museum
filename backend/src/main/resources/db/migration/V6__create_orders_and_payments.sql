CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(32) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT',
  payable_amount DECIMAL(10,2) NOT NULL,
  notification_email VARCHAR(254) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  paid_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  cancel_reason VARCHAR(255) NULL,
  status_updated_by BIGINT UNSIGNED NULL,
  status_updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_orders PRIMARY KEY(id), CONSTRAINT uq_orders_no UNIQUE(order_no),
  CONSTRAINT fk_orders_user FOREIGN KEY(user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_status_updater FOREIGN KEY(status_updated_by) REFERENCES users(id),
  CONSTRAINT chk_orders_status CHECK(status IN ('PENDING_PAYMENT','PAID','CANCELLED','COMPLETED')),
  INDEX idx_orders_user_status_time(user_id,status,created_at,id), INDEX idx_orders_status_time(status,created_at,id), INDEX idx_orders_expiry(status,expires_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
  product_sku_snapshot VARCHAR(64) NOT NULL, product_name_snapshot VARCHAR(150) NOT NULL, product_cover_url_snapshot VARCHAR(500) NULL,
  unit_price DECIMAL(10,2) NOT NULL, quantity INT UNSIGNED NOT NULL, subtotal_amount DECIMAL(10,2) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_order_items PRIMARY KEY(id), CONSTRAINT fk_order_items_order FOREIGN KEY(order_id) REFERENCES orders(id), CONSTRAINT fk_order_items_product FOREIGN KEY(product_id) REFERENCES products(id),
  INDEX idx_order_items_order(order_id,id), INDEX idx_order_items_product(product_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, payment_no VARCHAR(32) NOT NULL, order_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL, amount DECIMAL(10,2) NOT NULL, method VARCHAR(16) NOT NULL DEFAULT 'MOCK', status VARCHAR(16) NOT NULL DEFAULT 'INITIATED', paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_payment_transactions PRIMARY KEY(id), CONSTRAINT uq_payment_transactions_no UNIQUE(payment_no), CONSTRAINT uq_payment_transactions_key UNIQUE(idempotency_key),
  CONSTRAINT fk_payment_transactions_order FOREIGN KEY(order_id) REFERENCES orders(id), CONSTRAINT chk_payment_transactions_status CHECK(status IN ('INITIATED','SUCCEEDED','FAILED')),
  INDEX idx_payment_transactions_order_status(order_id,status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
