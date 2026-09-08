const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");

const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");

const suffix = crypto.randomBytes(5).toString("hex");
const cameraCode = `CAM-INT-${suffix}`;
const email = `intelligence-${suffix}@ibvap.test`;
const password = "Intelligence#2026";
const faceCode = crypto.randomUUID();
const vehicleCode = crypto.randomUUID();
const plateCode = crypto.randomUUID();
const evidenceCode = crypto.randomUUID();
const sessionId = `session-${suffix}`;

let pool;
let userId;
let cameraId;
let faceEventId;
let vehicleEventId;
let plateEventId;
let token;

before(async () => {
  pool = getPool();
  const [user] = await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, 'Intelligence Test', ?, ?, 'ADMINISTRATOR', 'ACTIVE')`,
    [crypto.randomUUID(), email, await hashPassword(password)]
  );
  userId = user.insertId;
  const [camera] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, location_name, sector, source_type, stream_status, ai_status, enabled)
     VALUES (?, 'Intelligence Test Camera', 'Test Gate', 'North Sector', 'VIDEO_FILE', 'ONLINE', 'ACTIVE', 1)`,
    [cameraCode]
  );
  cameraId = camera.insertId;

  const [face] = await pool.execute(
    `INSERT INTO events
       (event_code, camera_id, event_type, object_type, track_id, confidence,
        risk_score, severity, status, context_json, occurred_at)
     VALUES (?, ?, 'FACE_DETECTED', 'PERSON', 'P-1', 0.9300, NULL, 'INFO', 'NEW', ?, UTC_TIMESTAMP())`,
    [faceCode, cameraId, JSON.stringify({
      source: "AI_FACE_ENGINE",
      observationId: crypto.randomUUID(),
      personTrackId: "P-1",
      streamSessionId: sessionId,
      faceBBox: { x1: 10, y1: 20, x2: 50, y2: 70 },
      detectionOnly: true,
    })]
  );
  faceEventId = face.insertId;

  const [vehicle] = await pool.execute(
    `INSERT INTO events
       (event_code, camera_id, event_type, object_type, track_id, confidence,
        risk_score, severity, status, context_json, occurred_at)
     VALUES (?, ?, 'VEHICLE_DETECTED', 'VEHICLE', 'V-1', 0.8800, 0, 'INFO', 'NEW', ?, UTC_TIMESTAMP())`,
    [vehicleCode, cameraId, JSON.stringify({
      source: "AI_ENGINE",
      observationId: crypto.randomUUID(),
      trackId: "V-1",
      streamSessionId: sessionId,
      vehicleType: "CAR",
      bbox: { x1: 1, y1: 2, x2: 101, y2: 102 },
    })]
  );
  vehicleEventId = vehicle.insertId;

  const [plateEvent] = await pool.execute(
    `INSERT INTO events
       (event_code, camera_id, event_type, object_type, track_id, confidence,
        risk_score, severity, status, context_json, occurred_at)
     VALUES (?, ?, 'PLATE_DETECTED', 'VEHICLE', 'V-1', 0.8100, NULL, 'INFO', 'NEW', ?, UTC_TIMESTAMP())`,
    [plateCode, cameraId, JSON.stringify({
      source: "AI_ANPR_ENGINE",
      observationId: crypto.randomUUID(),
      vehicleTrackId: "V-1",
      streamSessionId: sessionId,
      rawText: "KA 01 AB 1234",
      plateBBox: { x1: 20, y1: 60, x2: 80, y2: 80 },
    })]
  );
  plateEventId = plateEvent.insertId;

  await pool.execute(
    `INSERT INTO plates
       (plate_event_code, event_id, camera_id, vehicle_track_id, plate_text,
        ocr_confidence, vehicle_type, captured_at)
     VALUES (?, ?, ?, 'V-1', 'KA01AB1234', 0.8200, 'CAR', UTC_TIMESTAMP())`,
    [plateCode, plateEventId, cameraId]
  );
  await pool.execute(
    `INSERT INTO evidence
       (evidence_code, event_id, camera_id, evidence_type, file_path, mime_type, captured_at)
     VALUES (?, ?, ?, 'FACE', 'storage/faces/test-only.jpg', 'image/jpeg', UTC_TIMESTAMP())`,
    [evidenceCode, faceEventId, cameraId]
  );

  const login = await request(app).post("/api/auth/login").send({ email, password });
  assert.strictEqual(login.status, 200);
  token = login.body.data.accessToken;
});

after(async () => {
  await pool.execute("DELETE FROM evidence WHERE evidence_code = ?", [evidenceCode]).catch(() => {});
  await pool.execute("DELETE FROM plates WHERE plate_event_code = ?", [plateCode]).catch(() => {});
  for (const id of [plateEventId, vehicleEventId, faceEventId]) {
    if (id) await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  if (cameraId) await pool.execute("DELETE FROM cameras WHERE id = ?", [cameraId]).catch(() => {});
  if (userId) await pool.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
  await closeDatabasePool();
});

const get = (path) => request(app).get(path).set("Authorization", `Bearer ${token}`);

test("intelligence summary uses real today records and active camera rows", async () => {
  const res = await get("/api/intelligence/summary");
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.activeCameras >= 1);
  assert.ok(res.body.data.anprToday >= 1);
  assert.ok(res.body.data.faceDetectionsToday >= 1);
  assert.ok(res.body.data.vehicleEventsToday >= 1);
  assert.strictEqual(res.body.data.timezone, "Asia/Kolkata");
  assert.ok(res.body.data.cameras.includes(cameraCode));
});

test("face intelligence supports camera, confidence and today filters with evidence", async () => {
  const res = await get(`/api/intelligence/faces?cameraId=${cameraCode}&confidence=high&date=today`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.pagination.total, 1);
  const face = res.body.data.items[0];
  assert.deepStrictEqual(face.bbox, { x1: 10, y1: 20, x2: 50, y2: 70 });
  assert.strictEqual(face.evidenceId, evidenceCode);
  assert.strictEqual(face.relatedEventId, faceCode);
  assert.strictEqual(face.personName, undefined);
});

test("vehicle intelligence returns detector metadata and only session-linked real plate OCR", async () => {
  const res = await get(`/api/intelligence/vehicles?cameraId=${cameraCode}&vehicleType=car&minConfidence=0.8`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.pagination.total, 1);
  const vehicle = res.body.data.items[0];
  assert.strictEqual(vehicle.vehicleType, "CAR");
  assert.strictEqual(vehicle.plateText, "KA01AB1234");
  assert.strictEqual(vehicle.relatedEventId, vehicleCode);
});

test("ANPR filters use non-overlapping confidence bands and central camelCase mapping", async () => {
  const medium = await get(`/api/intelligence/plates?cameraId=${cameraCode}&confidence=medium&date=today`);
  assert.strictEqual(medium.status, 200);
  assert.strictEqual(medium.body.data.pagination.total, 1);
  assert.strictEqual(medium.body.data.items[0].plateText, "KA01AB1234");
  assert.strictEqual(medium.body.data.items[0].rawText, "KA 01 AB 1234");
  assert.strictEqual(medium.body.data.items[0].plate_text, undefined);

  const high = await get(`/api/intelligence/plates?cameraId=${cameraCode}&confidence=high`);
  assert.strictEqual(high.status, 200);
  assert.strictEqual(high.body.data.pagination.total, 0);
});

