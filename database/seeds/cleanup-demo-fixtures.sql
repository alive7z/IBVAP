-- ============================================================
-- IBVAP demo fixture cleanup (development only)
--
-- Removes the OLD demo/test ALERTS and EVENTS that were seeded by
-- database/seeds/demo_seed.sql and surfaced on the Alerts page as stale
-- "old alerts from previous runs/tests".
--
-- This is a CONTROLLED cleanup: it targets only the exact fixture codes
-- created by the demo seed. No real observation/event/alert data is touched.
--
-- Order matters (FK integrity):
--   1. alerts  reference events (event_id)  -> delete alerts first
--   2. events  reference cameras            -> delete fixture events next
--   3. evidence references events + alerts  -> no fixture evidence exists,
--      but guarded cleanup below is a safe no-op if any appears later
-- ============================================================

USE ibvap;

-- 1) Demo alerts (the 2 stale rows shown on the Alerts page)
DELETE FROM alerts
 WHERE alert_code IN (
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',  -- SECURITY_ALERT / HIGH / ACTIVE (demo)
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'   -- NIGHT_MOVEMENT_ALERT / MEDIUM / ACKNOWLEDGED (demo)
 );

-- 2) Demo evidence that may reference the fixture alerts (safe no-op today)
DELETE FROM evidence
 WHERE alert_id IN (
   SELECT id FROM alerts
   WHERE alert_code IN (
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
   )
 )
    OR event_id IN (
   SELECT id FROM events
   WHERE event_code IN (
     '11111111-1111-1111-1111-111111111111',  -- PERSON_DETECTED (demo)
     '22222222-2222-2222-2222-222222222222',  -- RESTRICTED_ZONE_ENTRY (demo)
     '33333333-3333-3333-3333-333333333333'   -- NIGHT_MOVEMENT (demo)
   )
 );

-- 3) Demo events
DELETE FROM events
 WHERE event_code IN (
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333'
 );