-- 009_create_audit_logs.sql
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
