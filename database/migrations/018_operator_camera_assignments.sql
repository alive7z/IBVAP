-- 018_operator_camera_assignments.sql
-- Relational link between operators (SECURITY_OPERATOR users) and cameras.
CREATE TABLE IF NOT EXISTS operator_camera_assignments (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operator_id  BIGINT UNSIGNED NOT NULL,
  camera_id    BIGINT UNSIGNED NOT NULL,
  assigned_by  BIGINT UNSIGNED NULL,
  assigned_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_op_cam (operator_id, camera_id),
  KEY idx_ocam_camera_id (camera_id),
  KEY idx_ocam_assigned_by (assigned_by),
  CONSTRAINT fk_ocam_operator FOREIGN KEY (operator_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ocam_camera FOREIGN KEY (camera_id)
    REFERENCES cameras (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ocam_assigned_by FOREIGN KEY (assigned_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
