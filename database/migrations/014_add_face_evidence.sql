-- 014_add_face_evidence.sql
-- Enable FACE evidence type for detection-only face crops attached to a
-- FACE_DETECTED event (event-anchored; alert_id stays NULL). The constraint in
-- 008_create_evidence.sql already permits a NULL alert_id.
ALTER TABLE evidence
  MODIFY COLUMN evidence_type ENUM('SNAPSHOT','INCIDENT_CLIP','FACE') NOT NULL;
