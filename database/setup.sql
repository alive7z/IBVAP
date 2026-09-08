-- ============================================================
-- IBVAP local setup — run ONCE as MySQL root/admin
--
--   mysql -uroot -p < database/setup.sql
--
-- Creates the application database and the dedicated
-- development app user. The app never connects as root.
--
-- NOTE: replace <DEV_PASSWORD> below with your preferred local
-- development password. It must match DB_PASSWORD in backend/.env.
-- ============================================================

CREATE DATABASE IF NOT EXISTS ibvap
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'ibvap_app'@'localhost' IDENTIFIED BY '<DEV_PASSWORD>';
CREATE USER IF NOT EXISTS 'ibvap_app'@'127.0.0.1' IDENTIFIED BY '<DEV_PASSWORD>';

GRANT ALL PRIVILEGES ON ibvap.* TO 'ibvap_app'@'localhost';
GRANT ALL PRIVILEGES ON ibvap.* TO 'ibvap_app'@'127.0.0.1';

FLUSH PRIVILEGES;
