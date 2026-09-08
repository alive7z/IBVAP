-- Website-managed camera configuration: per-camera target processing FPS +
-- soft-delete marker. Soft deletion (not a hard DELETE) preserves referential
-- integrity with events/zones (FK RESTRICT) and keeps audit history intact.
ALTER TABLE cameras
  ADD COLUMN target_fps DECIMAL(5,2) NULL AFTER stream_protocol,
  ADD COLUMN deleted_at DATETIME NULL AFTER enabled;