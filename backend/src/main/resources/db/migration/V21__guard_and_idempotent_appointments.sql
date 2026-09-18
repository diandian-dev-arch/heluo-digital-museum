-- Preserve existing bookings while enforcing idempotent active reservations.
ALTER TABLE appointments
  ADD COLUMN creation_idempotency_key VARCHAR(64) NULL;

ALTER TABLE appointments
  ADD CONSTRAINT uq_appointments_user_creation_key UNIQUE (user_id, creation_idempotency_key);

-- Keep the active-state projection visible to database tooling. Historical
-- duplicate rows are intentionally not deleted; the unique appointment_active_keys
-- table below is the enforcement layer that can be populated only for
-- unambiguous pairs.
ALTER TABLE appointments
  ADD COLUMN active_user_id BIGINT GENERATED ALWAYS AS
    (CASE WHEN status IN ('PENDING', 'CONFIRMED') THEN user_id ELSE NULL END);

CREATE INDEX idx_appointments_slot_active_user ON appointments(slot_id, active_user_id);

CREATE TABLE appointment_integrity_conflicts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  slot_id BIGINT UNSIGNED NOT NULL,
  appointment_count INT UNSIGNED NOT NULL,
  first_appointment_id BIGINT UNSIGNED NOT NULL,
  detected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_appointment_integrity_conflicts PRIMARY KEY (id),
  CONSTRAINT fk_appointment_conflicts_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_appointment_conflicts_slot FOREIGN KEY (slot_id) REFERENCES appointment_slots(id),
  INDEX idx_appointment_conflicts_pair(user_id, slot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO appointment_integrity_conflicts(user_id, slot_id, appointment_count, first_appointment_id)
SELECT user_id, slot_id, COUNT(*), MIN(id)
FROM appointments
WHERE status IN ('PENDING', 'CONFIRMED')
GROUP BY user_id, slot_id
HAVING COUNT(*) > 1;

CREATE TABLE appointment_active_keys (
  user_id BIGINT UNSIGNED NOT NULL,
  slot_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT pk_appointment_active_keys PRIMARY KEY (user_id, slot_id),
  CONSTRAINT uq_appointment_active_key_appointment UNIQUE (appointment_id),
  CONSTRAINT fk_active_key_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_active_key_slot FOREIGN KEY (slot_id) REFERENCES appointment_slots(id),
  CONSTRAINT fk_active_key_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unambiguous historical pairs are protected. Conflicting rows remain intact
-- and are listed above for an operator to resolve manually.
INSERT INTO appointment_active_keys(user_id, slot_id, appointment_id)
SELECT user_id, slot_id, MIN(id)
FROM appointments
WHERE status IN ('PENDING', 'CONFIRMED')
GROUP BY user_id, slot_id
HAVING COUNT(*) = 1;
