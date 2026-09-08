-- ============================================================
-- IBVAP demo seed (development only)
-- Safe to re-run for development: uses explicit unique codes plus
-- INSERT IGNORE / NOT EXISTS guards to avoid duplicate records.
-- Does NOT store any real credentials, IPs, or URLs.
-- ============================================================

USE ibvap;

-- ------------------------------------------------------------
-- Users (3) - password_hash is a placeholder; real bcrypt hashing
-- arrives in Phase 3 (Authentication).
-- ------------------------------------------------------------
INSERT IGNORE INTO users
  (public_id, full_name, email, password_hash, role, status)
VALUES
  (UUID(), 'Demo Administrator', 'admin@ibvap.demo',    'PLACEHOLDER_PHASE3', 'ADMINISTRATOR',    'ACTIVE'),
  (UUID(), 'Demo Operator',      'operator@ibvap.demo', 'PLACEHOLDER_PHASE3', 'SECURITY_OPERATOR','ACTIVE'),
  (UUID(), 'Demo Analyst',       'analyst@ibvap.demo',  'PLACEHOLDER_PHASE3', 'AUDITOR_ANALYST',  'ACTIVE');

-- ------------------------------------------------------------
-- Cameras (8). CAM-01 is the MOBILE demo camera.
-- No real IP/hostname/URL/credentials are stored.
-- ------------------------------------------------------------
INSERT IGNORE INTO cameras
  (camera_code, name, description, location_name, sector, source_type, stream_protocol, stream_url, stream_status, ai_status, enabled)
VALUES
  ('CAM-01', 'Mobile Demo Camera', 'Live mobile phone camera for demo (phone replaces dedicated CCTV).', 'Demo Surveillance Area', 'North Sector', 'MOBILE',      NULL, NULL,                       'NOT_CONFIGURED', 'NOT_CONFIGURED', 1),
  ('CAM-02', 'North Gate Camera',  'Fixed IP camera at the north gate.',           'North Gate',         'North Sector', 'IP_CAMERA', 'RTSP', 'rtsp://placeholder.invalid/north-gate',      'OFFLINE', 'NOT_CONFIGURED', 1),
  ('CAM-03', 'East Perimeter Camera', 'Fixed IP camera along the east perimeter.', 'East Perimeter',    'East Sector',  'IP_CAMERA', 'RTSP', 'rtsp://placeholder.invalid/east-perimeter',  'OFFLINE', 'NOT_CONFIGURED', 1),
  ('CAM-04', 'West Patrol Camera', 'Fixed IP camera covering the west patrol road.','West Patrol Road', 'West Sector',  'IP_CAMERA', 'RTSP', 'rtsp://placeholder.invalid/west-patrol',       'OFFLINE', 'NOT_CONFIGURED', 1),
  ('CAM-05', 'South Checkpoint Camera', 'Fixed IP camera at the south checkpoint.','South Checkpoint',  'South Sector', 'IP_CAMERA', 'RTSP', 'rtsp://placeholder.invalid/south-checkpoint', 'OFFLINE', 'NOT_CONFIGURED', 1),
  ('CAM-06', 'Warehouse Loading Dock', 'Fixed IP camera overlooking the warehouse loading dock.', 'Warehouse Dock', 'East Sector', 'IP_CAMERA', 'RTSP', 'rtsp://placeholder.invalid/warehouse-dock', 'OFFLINE', 'NOT_CONFIGURED', 1),
  ('CAM-07', 'Parking Lot Camera', 'Fixed IP camera covering the main parking lot.', 'Main Parking Lot', 'North Sector', 'IP_CAMERA', 'HLS', 'https://placeholder.invalid/parking-lot', 'OFFLINE', 'NOT_CONFIGURED', 1),
  ('CAM-08', 'Archive Review Clip', 'Offline video file source used for historical review.', 'Evidence Archive', 'Central Sector', 'VIDEO_FILE', NULL, '/storage/clips/review-sample.mp4', 'OFFLINE', 'NOT_CONFIGURED', 0);

-- The mobile encoder publishes CAM-01 in portrait dimensions. Rotate once at
-- ingestion so inference, evidence, overlays, and preview share landscape axes.
UPDATE cameras SET rotation_degrees = 90 WHERE camera_code = 'CAM-01';

-- ------------------------------------------------------------
-- Zones (6)
-- ------------------------------------------------------------
INSERT IGNORE INTO zones
  (zone_code, camera_id, name, zone_type, risk_level, coordinates_json, enabled)
SELECT z.zone_code, c.id, z.name, z.zone_type, z.risk_level, z.coordinates_json, 1
FROM (SELECT 'ZONE-01' AS zone_code, 'CAM-01' AS camera_code, 'Mobile Restricted Core' AS name, 'RESTRICTED' AS zone_type, 'CRITICAL' AS risk_level,
             JSON_ARRAY(JSON_OBJECT('x',0.20,'y',0.20), JSON_OBJECT('x',0.70,'y',0.20), JSON_OBJECT('x',0.70,'y',0.80), JSON_OBJECT('x',0.20,'y',0.80)) AS coordinates_json
      UNION ALL SELECT 'ZONE-02','CAM-01','Mobile Virtual Fence','VIRTUAL_FENCE','HIGH',
             JSON_ARRAY(JSON_OBJECT('x',0.10,'y',0.10), JSON_OBJECT('x',0.90,'y',0.10), JSON_OBJECT('x',0.90,'y',0.90), JSON_OBJECT('x',0.10,'y',0.90))
      UNION ALL SELECT 'ZONE-03','CAM-02','North Gate Restricted','RESTRICTED','HIGH',
             JSON_ARRAY(JSON_OBJECT('x',0.15,'y',0.15), JSON_OBJECT('x',0.65,'y',0.15), JSON_OBJECT('x',0.65,'y',0.75))
      UNION ALL SELECT 'ZONE-04','CAM-03','East Perimeter Fence','VIRTUAL_FENCE','CRITICAL',
             JSON_ARRAY(JSON_OBJECT('x',0.05,'y',0.05), JSON_OBJECT('x',0.50,'y',0.05), JSON_OBJECT('x',0.50,'y',0.95))
      UNION ALL SELECT 'ZONE-05','CAM-05','South Checkpoint Monitor','MONITORING','MEDIUM',
             JSON_ARRAY(JSON_OBJECT('x',0.30,'y',0.20), JSON_OBJECT('x',0.80,'y',0.20), JSON_OBJECT('x',0.80,'y',0.80))
      UNION ALL SELECT 'ZONE-06','CAM-06','Warehouse Dock Restricted','RESTRICTED','MEDIUM',
             JSON_ARRAY(JSON_OBJECT('x',0.25,'y',0.25), JSON_OBJECT('x',0.75,'y',0.25), JSON_OBJECT('x',0.75,'y',0.75))
      UNION ALL SELECT 'ZONE-07','CAM-01','Mobile Bottom Perimeter','RESTRICTED','HIGH',
             JSON_ARRAY(JSON_OBJECT('x',0.35,'y',0.85), JSON_OBJECT('x',0.75,'y',0.85), JSON_OBJECT('x',0.75,'y',1.00), JSON_OBJECT('x',0.35,'y',1.00))
      UNION ALL SELECT 'ZONE-08','CAM-01','Mobile Center Fence','VIRTUAL_FENCE','HIGH',
             JSON_ARRAY(JSON_OBJECT('x',0.50,'y',0.10), JSON_OBJECT('x',0.50,'y',0.90))
     ) z
JOIN cameras c ON c.camera_code = z.camera_code
WHERE NOT EXISTS (SELECT 1 FROM zones WHERE zones.zone_code = z.zone_code);

-- ------------------------------------------------------------
-- Risk Rules (8)
-- ------------------------------------------------------------
INSERT IGNORE INTO risk_rules
  (rule_code, name, description, category, weight, minimum_duration_ms, confidence_threshold, cooldown_seconds, enabled)
VALUES
  ('RESTRICTED_ZONE_ENTRY', 'Restricted Zone Entry', 'Person/vehicle detected inside a restricted zone.', 'PERIMETER', 5.0, 1000, 0.60, 30, 1),
  ('VIRTUAL_FENCE_CROSSING', 'Virtual Fence Crossing', 'Object crosses a configured virtual fence.', 'PERIMETER', 6.0, 500, 0.65, 30, 1),
  ('FENCE_PROXIMITY', 'Fence Proximity', 'Person is too close to the physical/virtual fence line.', 'PERIMETER', 3.0, 2000, 0.50, 20, 1),
  ('NIGHT_MOVEMENT', 'Night Movement', 'Movement detected during night/low-light hours.', 'TEMPORAL', 3.0, 3000, 0.55, 45, 1),
  ('LOITERING', 'Loitering', 'An object remains in a zone beyond a set duration.', 'BEHAVIORAL', 3.0, 15000, 0.60, 60, 1),
  -- TOWARD_BOUNDARY / UNUSUAL_SPEED have no runtime producer in the AI engine
  -- (see CONTEXT_TO_RULE) and are disabled in the demo config.
  ('TOWARD_BOUNDARY', 'Toward Boundary', 'Tracked subject consistently moving toward the boundary.', 'BEHAVIORAL', 2.5, 3000, 0.60, 30, 0),
  ('REPEATED_ENTRY', 'Repeated Entry', 'Same object enters the same zone repeatedly.', 'BEHAVIORAL', 3.0, 0, 0.55, 120, 0),
  ('UNUSUAL_SPEED', 'Unusual Speed', 'Object speed is inconsistent with expected for the area.', 'BEHAVIORAL', 2.0, 0, 0.55, 30, 0);

-- ------------------------------------------------------------
-- Demo Events (a few) + linked Alerts, demonstrating the
-- events != alerts architecture.
-- ------------------------------------------------------------
INSERT IGNORE INTO events
  (event_code, camera_id, event_type, object_type, track_id, confidence, risk_score, severity, status, context_json, occurred_at)
SELECT e.event_code, c.id, e.event_type, e.object_type, e.track_id, e.confidence, e.risk_score, e.severity, e.status, e.context_json, e.occurred_at
FROM (SELECT '11111111-1111-1111-1111-111111111111' AS event_code, 'CAM-02' AS camera_code, 'PERSON_DETECTED' AS event_type, 'PERSON' AS object_type, 'TRK-1001' AS track_id, 0.92 AS confidence, 0.15 AS risk_score, 'INFO' AS severity, 'NEW' AS status,
             JSON_OBJECT('notes','Walk-in near gate') AS context_json, DATE_SUB(NOW(), INTERVAL 2 HOUR) AS occurred_at
      UNION ALL SELECT '22222222-2222-2222-2222-222222222222','CAM-02','RESTRICTED_ZONE_ENTRY','PERSON','TRK-1002',0.88,3.40,'HIGH','ACTIVE',
             JSON_OBJECT('rule','RESTRICTED_ZONE_ENTRY','zone','ZONE-03'), DATE_SUB(NOW(), INTERVAL 1 HOUR)
      UNION ALL SELECT '33333333-3333-3333-3333-333333333333','CAM-05','NIGHT_MOVEMENT','PERSON','TRK-1003',0.75,2.20,'MEDIUM','ACKNOWLEDGED',
             JSON_OBJECT('rule','NIGHT_MOVEMENT'), DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      UNION ALL SELECT '44444444-4444-4444-4444-444444444444','CAM-07','VEHICLE_DETECTED','VEHICLE','TRK-2001',0.95,0.20,'INFO','NEW',
             JSON_OBJECT('color','white','type','sedan'), DATE_SUB(NOW(), INTERVAL 15 MINUTE)
     ) e
JOIN cameras c ON c.camera_code = e.camera_code
WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.event_code = e.event_code);

INSERT IGNORE INTO alerts
  (alert_code, event_id, camera_id, alert_type, severity, risk_score, status, reason_json)
SELECT a.alert_code, ev.id, c.id, a.alert_type, a.severity, a.risk_score, a.status, a.reason_json
FROM (SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AS alert_code, '22222222-2222-2222-2222-222222222222' AS event_code, 'CAM-02' AS camera_code,
             'SECURITY_ALERT' AS alert_type, 'HIGH' AS severity, 3.40 AS risk_score, 'ACTIVE' AS status,
             JSON_OBJECT('rules', JSON_ARRAY('RESTRICTED_ZONE_ENTRY','NIGHT_MOVEMENT')) AS reason_json
      UNION ALL SELECT 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333','CAM-05',
             'NIGHT_MOVEMENT_ALERT','MEDIUM',2.20,'ACKNOWLEDGED',
             JSON_OBJECT('rules', JSON_ARRAY('NIGHT_MOVEMENT'))
     ) a
JOIN events ev ON ev.event_code = a.event_code
JOIN cameras c ON c.camera_code = a.camera_code
WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE alerts.alert_code = a.alert_code);
