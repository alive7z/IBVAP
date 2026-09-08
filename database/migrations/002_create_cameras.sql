-- 002_create_cameras.sql
CREATE TABLE IF NOT EXISTS cameras (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  camera_code    VARCHAR(32) NOT NULL,
  name           VARCHAR(150) NOT NULL,
  description    TEXT NULL,
  location_name  VARCHAR(255) NULL,
  sector         VARCHAR(150) NULL,
  source_type    ENUM('MOBILE','IP_CAMERA','VIDEO_FILE','OTHER') NOT NULL DEFAULT 'IP_CAMERA',
  stream_protocol ENUM('RTSP','HTTP','HLS','WEBRTC','OTHER') NULL,
  stream_url     TEXT NULL,
  stream_status  ENUM('ONLINE','OFFLINE','CONNECTING','ERROR','NOT_CONFIGURED','DISABLED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  ai_status      ENUM('ACTIVE','PAUSED','ERROR','NOT_CONFIGURED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  enabled        TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cameras_camera_code (camera_code),
  KEY idx_cameras_source_type (source_type),
  KEY idx_cameras_stream_status (stream_status),
  KEY idx_cameras_sector (sector),
  KEY idx_cameras_enabled (enabled)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
