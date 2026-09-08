-- 010_create_system_health.sql
CREATE TABLE IF NOT EXISTS system_health (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  component    VARCHAR(64) NOT NULL,
  status       VARCHAR(32) NOT NULL,
  message      TEXT NULL,
  metric_json  JSON NULL,
  recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_system_health_component (component),
  KEY idx_system_health_recorded_at (recorded_at),
  KEY idx_system_health_component_recorded (component, recorded_at)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
