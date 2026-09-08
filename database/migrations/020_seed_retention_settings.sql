-- 020_seed_retention_settings.sql
-- Seed the single canonical retention configuration row.
INSERT INTO retention_settings (id, max_normal_events, normal_event_hours, medium_event_hours,
  high_alert_hours, critical_alert_hours, evidence_hours, auto_cleanup_enabled, cleanup_interval_minutes)
VALUES (1, 400, 48, 72, 168, 0, 168, 1, 60)
ON DUPLICATE KEY UPDATE id = id;
