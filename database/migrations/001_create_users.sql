-- 001_create_users.sql
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
