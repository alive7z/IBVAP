const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const env = require("../src/config/env");

let pool;
let testCameraId;
let testDisabledCameraId;
let createdEventIds = [];

const SERVICE_TOKEN = env.AI_SERVICE_TOKEN || "test-service-token";

const insertCamera = async ({ code, enabled = 1 }) => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, ?, 'VIDEO_FILE', 'ONLINE', 'ACTIVE', ?)`,
    [code, "AI Test " + code, enabled]
  );
  return result.insertId;
};

const cleanupCamera = async (id) => {
  if (id) {
    await pool.execute("DELETE FROM cameras WHERE id = ?", [id]).catch(() => {});
  }
};

// Shared valid observation payload.
const personObservation = (overrides = {}) => ({
  schemaVersion: 1,
  cameraCode: "CAM-AI-ENABLED",
  observations: [
    {
      observationId: crypto.randomUUID(),
      trackId: 7,
      eventType: "PERSON_DETECTED",
      objectType: "PERSON",
      confidence: 0.91,
      occurredAt: new Date().toISOString(),
      bbox: { x1: 100, y1: 80, x2: 200, y2: 300 },
      ...overrides,
    },
  ],
});

const vehicleObservation = () =>
  personObservation({
    trackId: 12,
    eventType: "VEHICLE_DETECTED",
    objectType: "VEHICLE",
    vehicleType: "CAR",
    confidence: 0.85,
    bbox: { x1: 50, y1: 60, x2: 180, y2: 120 },
  });

before(async () => {
  pool = getPool();
  // Idempotent cleanup in FK-safe order (evidence -> alerts -> events -> cameras).
  await pool.execute(
    "DELETE FROM evidence WHERE alert_id IN (SELECT id FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-AI-ENABLED','CAM-AI-DISABLED')))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-AI-ENABLED','CAM-AI-DISABLED'))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-AI-ENABLED','CAM-AI-DISABLED'))"
  ).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code IN ('CAM-AI-ENABLED','CAM-AI-DISABLED')").catch(() => {});
  testCameraId = await insertCamera({ code: "CAM-AI-ENABLED", enabled: 1 });
  testDisabledCameraId = await insertCamera({ code: "CAM-AI-DISABLED", enabled: 0 });
});

after(async () => {
  for (const id of createdEventIds) {
    if (id) await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  await pool.execute(
    "DELETE FROM evidence WHERE alert_id IN (SELECT id FROM alerts WHERE camera_id IN (?, ?))",
    [testCameraId, testDisabledCameraId]
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM alerts WHERE camera_id IN (?, ?)",
    [testCameraId, testDisabledCameraId]
  ).catch(() => {});
  await pool.execute("DELETE FROM events WHERE camera_id IN (?, ?)", [testCameraId, testDisabledCameraId]).catch(() => {});
  await cleanupCamera(testDisabledCameraId);
  await cleanupCamera(testCameraId);
  await closeDatabasePool();
});

test("missing service token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .send(personObservation());
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.success, false);
});

test("invalid service token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token")
    .send(personObservation());
  assert.strictEqual(res.status, 401);
});

test("unknown camera is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...personObservation(), cameraCode: "CAM-DOES-NOT-EXIST" });
  assert.strictEqual(res.status, 404);
});

test("disabled camera is rejected with 400", async () => {
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...personObservation(), cameraCode: "CAM-AI-DISABLED" });
  assert.strictEqual(res.status, 400);
});

test("valid person observation creates INFO event and returns 200", async () => {
  const payload = personObservation();
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.eventsCreated, 1);

  const [rows] = await pool.execute(
    "SELECT * FROM events WHERE camera_id = ? AND track_id = ? ORDER BY id DESC LIMIT 1",
    [testCameraId, "7"]
  );
  assert.ok(rows[0], "event should exist in DB");
  createdEventIds.push(rows[0].id);
  assert.strictEqual(rows[0].event_type, "PERSON_DETECTED");
  assert.strictEqual(rows[0].object_type, "PERSON");
  assert.strictEqual(rows[0].severity, "INFO");
  assert.strictEqual(Number(rows[0].risk_score), 0);
  const context = typeof rows[0].context_json === "string"
    ? JSON.parse(rows[0].context_json)
    : rows[0].context_json;
  assert.strictEqual(context.source, "AI_ENGINE");
  assert.strictEqual(context.observationId, payload.observations[0].observationId);
});

test("valid vehicle observation creates INFO event with vehicleType in context", async () => {
  const payload = vehicleObservation();
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.eventsCreated, 1);

  const [rows] = await pool.execute(
    "SELECT * FROM events WHERE camera_id = ? AND track_id = ? ORDER BY id DESC LIMIT 1",
    [testCameraId, "12"]
  );
  assert.ok(rows[0]);
  createdEventIds.push(rows[0].id);
  assert.strictEqual(rows[0].event_type, "VEHICLE_DETECTED");
  assert.strictEqual(rows[0].severity, "INFO");
  const context = typeof rows[0].context_json === "string"
    ? JSON.parse(rows[0].context_json)
    : rows[0].context_json;
  assert.strictEqual(context.vehicleType, "CAR");
});

test("NO alert row is created for a detection event", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(personObservation({ trackId: 99 }));
  assert.strictEqual(res.status, 200);
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

test("duplicate observationId is deduplicated", async () => {
  const payload = personObservation({ trackId: 55 });
  const obsId = payload.observations[0].observationId;

  const first = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(first.body.data.eventsCreated, 1);

  // Re-send the exact same observation (simulated retry).
  const second = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(second.body.data.eventsCreated, 0);

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM events WHERE camera_id = ? AND
       JSON_UNQUOTE(JSON_EXTRACT(context_json, '$.observationId')) = ?`,
    [testCameraId, obsId]
  );
  assert.strictEqual(rows[0].c, 1);
});

test("same live session and track emits one detection but reused id in a new session is allowed", async () => {
  const sessionA = `session-a-${crypto.randomUUID()}`;
  const sessionB = `session-b-${crypto.randomUUID()}`;
  const firstPayload = personObservation({
    observationId: crypto.randomUUID(),
    trackId: 777,
    streamSessionId: sessionA,
  });

  const first = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(firstPayload);
  assert.strictEqual(first.body.data.eventsCreated, 1);

  // A different transport request/observation UUID is still the same semantic
  // detection event within this live stream session.
  const duplicate = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(personObservation({
      observationId: crypto.randomUUID(),
      trackId: 777,
      streamSessionId: sessionA,
    }));
  assert.strictEqual(duplicate.body.data.eventsCreated, 0);

  // Numeric ByteTrack IDs are session-local; a genuine reconnect may reuse 777.
  const nextSession = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(personObservation({
      observationId: crypto.randomUUID(),
      trackId: 777,
      streamSessionId: sessionB,
    }));
  assert.strictEqual(nextSession.body.data.eventsCreated, 1);

  const [rows] = await pool.execute(
    `SELECT id, context_json FROM events
      WHERE camera_id = ? AND track_id = '777' AND event_type = 'PERSON_DETECTED'`,
    [testCameraId]
  );
  assert.strictEqual(rows.length, 2);
  for (const row of rows) createdEventIds.push(row.id);
  const sessions = rows.map((row) => {
    const context = typeof row.context_json === "string"
      ? JSON.parse(row.context_json)
      : row.context_json;
    return context.streamSessionId;
  });
  assert.deepStrictEqual(new Set(sessions), new Set([sessionA, sessionB]));
});

test("malformed observation is rejected with 400", async () => {
  const bad = personObservation();
  bad.observations[0].confidence = 5.0; // out of range
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("invalid bbox is rejected with 400", async () => {
  const bad = personObservation();
  bad.observations[0].bbox = { x1: 300, y1: 200, x2: 100, y2: 50 };
  const res = await request(app)
    .post("/api/internal/ai/observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});
