-- 005_create_events.sql
CREATE TABLE IF NOT EXISTS events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_code   CHAR(36) NOT NULL,
  camera_id    BIGINT UNSIGNED NULL,
  event_type   VARCHAR(64) NOT NULL,
  object_type  VARCHAR(64) NULL,
  track_id     VARCHAR(64) NULL,
  confidence   DECIMAL(5,4) NULL,
  risk_score   DECIMAL(5,2) NULL,
  severity     ENUM('INFO','LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'INFO',
  status       VARCHAR(32) NOT NULL DEFAULT 'NEW',
  context_json JSON NULL,
  occurred_at  DATETIME NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_event_code (event_code),
  KEY idx_events_camera_id (camera_id),
  KEY idx_events_occurred_at (occurred_at),
  KEY idx_events_event_type (event_type),
  KEY idx_events_severity (severity),
  KEY idx_events_camera_occurred (camera_id, occurred_at),
  CONSTRAINT fk_events_camera FOREIGN KEY (camera_id)
    REFERENCES cameras (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
