-- 017_events_protection.sql
-- Protection + soft-delete for events (protect survives retention cleanup;
-- soft-delete hides from normal listings without breaking FK relations).
ALTER TABLE events
  ADD COLUMN is_protected TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN protected_by BIGINT UNSIGNED NULL AFTER is_protected,
  ADD COLUMN protected_at DATETIME NULL AFTER protected_by,
  ADD COLUMN deleted_at DATETIME NULL AFTER protected_at,
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN deletion_reason VARCHAR(64) NULL AFTER deleted_by,
  ADD KEY idx_events_deleted_at (deleted_at),
  ADD KEY idx_events_is_protected (is_protected);
