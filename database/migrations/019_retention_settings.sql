-- 019_retention_settings.sql
-- Centralized retention policy (single canonical row, id = 1) for the Admin
-- Retention page and the periodic retention job.
CREATE TABLE IF NOT EXISTS retention_settings (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  max_normal_events       INT UNSIGNED NOT NULL DEFAULT 400,
  normal_event_hours      INT UNSIGNED NOT NULL DEFAULT 48,
  medium_event_hours      INT UNSIGNED NOT NULL DEFAULT 72,
  high_alert_hours        INT UNSIGNED NOT NULL DEFAULT 168,
  critical_alert_hours    INT UNSIGNED NOT NULL DEFAULT 0,
  evidence_hours          INT UNSIGNED NOT NULL DEFAULT 168,
  auto_cleanup_enabled    TINYINT(1) NOT NULL DEFAULT 1,
  cleanup_interval_minutes INT UNSIGNED NOT NULL DEFAULT 60,
  updated_by              BIGINT UNSIGNED NULL,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
