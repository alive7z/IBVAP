-- 016_alerts_lifecycle.sql
-- Expand alert lifecycle (preserves existing values), plus escalation,
-- protection, and soft-delete metadata.
ALTER TABLE alerts
  MODIFY COLUMN status ENUM('NEW','ACTIVE','ACKNOWLEDGED','INVESTIGATING','RESOLVED','FALSE_POSITIVE') NOT NULL DEFAULT 'NEW',
  ADD COLUMN investigation_started_at DATETIME NULL AFTER acknowledged_at,
  ADD COLUMN escalated TINYINT(1) NOT NULL DEFAULT 0 AFTER resolution_type,
  ADD COLUMN escalated_at DATETIME NULL AFTER escalated,
  ADD COLUMN escalated_to VARCHAR(64) NULL AFTER escalated_at,
  ADD COLUMN escalation_reason VARCHAR(255) NULL AFTER escalated_to,
  ADD COLUMN is_protected TINYINT(1) NOT NULL DEFAULT 0 AFTER escalation_reason,
  ADD COLUMN protected_by BIGINT UNSIGNED NULL AFTER is_protected,
  ADD COLUMN protected_at DATETIME NULL AFTER protected_by,
  ADD COLUMN deleted_at DATETIME NULL AFTER protected_at,
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN deletion_reason VARCHAR(64) NULL AFTER deleted_by,
  ADD KEY idx_alerts_deleted_at (deleted_at),
  ADD KEY idx_alerts_is_protected (is_protected),
  ADD KEY idx_alerts_escalated (escalated);
