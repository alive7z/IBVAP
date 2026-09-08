-- Per-camera clockwise source-frame orientation applied by the AI pipeline.
ALTER TABLE cameras
  ADD COLUMN rotation_degrees SMALLINT UNSIGNED NOT NULL DEFAULT 0
  CHECK (rotation_degrees IN (0, 90, 180, 270))
  AFTER stream_url;
