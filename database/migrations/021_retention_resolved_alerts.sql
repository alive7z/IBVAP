-- 021_retention_resolved_alerts.sql
-- Age-based retention window for resolved/false-positive alerts. Protected
-- alerts always survive; active (NEW/ACTIVE/ACKNOWLEDGED/INVESTIGATING) alerts
-- are never purged by retention regardless of age.
-- idempotent-duplicate-ok: this migration is a single additive column.
ALTER TABLE retention_settings
  ADD COLUMN resolved_alert_hours INT UNSIGNED NOT NULL DEFAULT 168
    AFTER high_alert_hours;
