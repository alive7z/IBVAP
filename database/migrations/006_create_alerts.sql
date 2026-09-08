-- 006_create_alerts.sql
CREATE TABLE IF NOT EXISTS alerts (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alert_code         CHAR(36) NOT NULL,
  event_id           BIGINT UNSIGNED NOT NULL,
  camera_id          BIGINT UNSIGNED NULL,
  alert_type         VARCHAR(64) NOT NULL,
  severity           ENUM('INFO','LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  risk_score         DECIMAL(5,2) NULL,
  status             ENUM('NEW','ACTIVE','ACKNOWLEDGED','RESOLVED') NOT NULL DEFAULT 'NEW',
  reason_json        JSON NULL,
  acknowledged_by    BIGINT UNSIGNED NULL,
  acknowledged_at    DATETIME NULL,
  resolved_by        BIGINT UNSIGNED NULL,
  resolved_at        DATETIME NULL,
  resolution_type    VARCHAR(64) NULL,
  resolution_notes   TEXT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alerts_alert_code (alert_code),
  KEY idx_alerts_camera_id (camera_id),
  KEY idx_alerts_event_id (event_id),
  KEY idx_alerts_status (status),
  KEY idx_alerts_severity (severity),
  KEY idx_alerts_created_at (created_at),
  CONSTRAINT fk_alerts_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_alerts_camera FOREIGN KEY (camera_id)
    REFERENCES cameras (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_alerts_acked_by FOREIGN KEY (acknowledged_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_alerts_resolved_by FOREIGN KEY (resolved_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
