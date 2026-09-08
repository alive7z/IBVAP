-- 003_create_zones.sql
CREATE TABLE IF NOT EXISTS zones (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  zone_code       VARCHAR(32) NOT NULL,
  camera_id       BIGINT UNSIGNED NOT NULL,
  name            VARCHAR(150) NOT NULL,
  zone_type       ENUM('RESTRICTED','MONITORING','VIRTUAL_FENCE') NOT NULL DEFAULT 'MONITORING',
  risk_level      ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'LOW',
  coordinates_json JSON NOT NULL,
  enabled         TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_zones_zone_code (zone_code),
  KEY idx_zones_camera_id (camera_id),
  CONSTRAINT fk_zones_camera FOREIGN KEY (camera_id)
    REFERENCES cameras (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
