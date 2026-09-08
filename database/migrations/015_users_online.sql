-- 015_users_online.sql
-- Operator presence: ONLINE/OFFLINE/IDLE resolved from live Socket.IO
-- connections + heartbeats, never a permanent "online forever" flag.
ALTER TABLE users
  ADD COLUMN online_status ENUM('ONLINE','OFFLINE','IDLE') NOT NULL DEFAULT 'OFFLINE' AFTER status,
  ADD COLUMN connected_at DATETIME NULL AFTER online_status,
  ADD COLUMN last_seen_at DATETIME NULL AFTER connected_at;
