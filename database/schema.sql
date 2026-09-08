-- ============================================================
-- IBVAP – Intelligent Border Video Analytics Platform
-- Phase 2 Core Database Schema (MySQL / InnoDB / utf8mb4)
-- ============================================================
-- Create the database and run in numeric order. This file
-- represents the complete Phase 2 schema and creates tables in
-- foreign-key dependency order. It is safe for repeated runs
-- (uses CREATE TABLE IF NOT EXISTS).
-- ============================================================

CREATE DATABASE IF NOT EXISTS ibvap
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ibvap;

-- ------------------------------------------------------------
-- 1. users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id     CHAR(36) NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('ADMINISTRATOR','SECURITY_OPERATOR','AUDITOR_ANALYST') NOT NULL DEFAULT 'SECURITY_OPERATOR',
  status        ENUM('ACTIVE','INACTIVE','LOCKED','PENDING') NOT NULL DEFAULT 'PENDING',
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_public_id (public_id),
  KEY idx_users_role (role),
  KEY idx_users_status (status)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. cameras
-- ------------------------------------------------------------
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
  target_fps     DECIMAL(5,2) NULL,
  rotation_degrees SMALLINT UNSIGNED NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0, 90, 180, 270)),
  stream_status  ENUM('ONLINE','OFFLINE','CONNECTING','ERROR','NOT_CONFIGURED','DISABLED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  ai_status      ENUM('ACTIVE','PAUSED','ERROR','NOT_CONFIGURED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  enabled        TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at     DATETIME NULL,
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

-- ------------------------------------------------------------
-- 3. zones
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. risk_rules
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_rules (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_code            VARCHAR(64) NOT NULL,
  name                 VARCHAR(150) NOT NULL,
  description          TEXT NULL,
  category             VARCHAR(100) NULL,
  weight               DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  minimum_duration_ms  INT UNSIGNED NOT NULL DEFAULT 0,
  confidence_threshold DECIMAL(5,2) NOT NULL DEFAULT 0.50,
  cooldown_seconds     INT UNSIGNED NOT NULL DEFAULT 0,
  enabled              TINYINT(1) NOT NULL DEFAULT 1,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_risk_rules_rule_code (rule_code),
  KEY idx_risk_rules_category (category),
  KEY idx_risk_rules_enabled (enabled)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. events
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 6. alerts
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 7. plates
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 8. evidence
-- ------------------------------------------------------------
-- NOTE: This table stores metadata ONLY. Media binaries live under
-- storage/snapshots and storage/clips. No blobs are stored here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evidence_code   CHAR(36) NOT NULL,
  event_id        BIGINT UNSIGNED NULL,
  alert_id        BIGINT UNSIGNED NULL,
  camera_id       BIGINT UNSIGNED NULL,
  evidence_type   ENUM('SNAPSHOT','INCIDENT_CLIP','FACE') NOT NULL,
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

-- ------------------------------------------------------------
-- 9. audit_logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NULL,
  action       VARCHAR(64) NOT NULL,
  entity_type  VARCHAR(64) NULL,
  entity_id    VARCHAR(64) NULL,
  details_json JSON NULL,
  ip_address   VARCHAR(64) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_user_id (user_id),
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_action (action),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. system_health
-- ------------------------------------------------------------
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
