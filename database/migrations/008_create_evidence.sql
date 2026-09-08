-- 008_create_evidence.sql
-- Metadata only. Media binaries are stored outside MySQL under storage/.
CREATE TABLE IF NOT EXISTS evidence (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evidence_code   CHAR(36) NOT NULL,
  event_id        BIGINT UNSIGNED NULL,
  alert_id        BIGINT UNSIGNED NULL,
  camera_id       BIGINT UNSIGNED NULL,
  evidence_type   ENUM('SNAPSHOT','INCIDENT_CLIP') NOT NULL,
  file_path       VARCHAR(1024) NOT NULL,
  mime_type       VARCHAR(128) NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  checksum        CHAR(64) NULL,
  captured_at     DATETIME NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_evidence_evidence_code (evidence_code),
  KEY idx_evidence_event_id (event_id),
  KEY idx_evidence_alert_id (alert_id),
  KEY idx_evidence_camera_id (camera_id),
  CONSTRAINT fk_evidence_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_evidence_alert FOREIGN KEY (alert_id)
    REFERENCES alerts (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_evidence_camera FOREIGN KEY (camera_id)
    REFERENCES cameras (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
