-- 004_create_risk_rules.sql
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
