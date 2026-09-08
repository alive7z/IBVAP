-- 007_create_plates.sql
CREATE TABLE IF NOT EXISTS plates (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plate_event_code  CHAR(36) NOT NULL,
  event_id          BIGINT UNSIGNED NOT NULL,
  camera_id         BIGINT UNSIGNED NULL,
  vehicle_track_id  VARCHAR(64) NULL,
  plate_text        VARCHAR(32) NOT NULL,
  ocr_confidence    DECIMAL(5,4) NULL,
  vehicle_type      VARCHAR(64) NULL,
  captured_at       DATETIME NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plates_plate_event_code (plate_event_code),
  KEY idx_plates_plate_text (plate_text),
  KEY idx_plates_camera_id (camera_id),
  KEY idx_plates_event_id (event_id),
  CONSTRAINT fk_plates_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_plates_camera FOREIGN KEY (camera_id)
    REFERENCES cameras (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
