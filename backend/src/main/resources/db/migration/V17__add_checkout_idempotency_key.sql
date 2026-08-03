ALTER TABLE orders
  ADD COLUMN checkout_idempotency_key VARCHAR(64) NULL;

ALTER TABLE orders
  ADD CONSTRAINT uq_orders_user_checkout_key UNIQUE (user_id, checkout_idempotency_key);
