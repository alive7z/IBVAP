const { test, before, after, mock } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const env = require("../src/config/env");
const realtimeService = require("../src/realtime/realtime.service");

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
    [code, "AI Face Test " + code, enabled]
  );
  return result.insertId;
};

const cleanupCamera = async (id) => {
  if (id) {
    await pool.execute("DELETE FROM cameras WHERE id = ?", [id]).catch(() => {});
  }
};

const faceObservation = (overrides = {}) => ({
  schemaVersion: 1,
  cameraCode: "CAM-FACE-ENABLED",
  observations: [
    {
      observationId: crypto.randomUUID(),
      cameraCode: "CAM-FACE-ENABLED",
      personTrackId: 7,
      faceDetectionConfidence: 0.9,
      occurredAt: new Date().toISOString(),
      sourceTimestampMs: 1000,
      faceBBox: { x1: 100, y1: 100, x2: 140, y2: 160 },
      ...overrides,
    },
  ],
});

const withSocketMocks = async (fn) => {
  const eventSpy = mock.method(realtimeService, "emitEventNew", () => {});
  const alertSpy = mock.method(realtimeService, "emitAlertNew", () => {});
  try {
    await fn({ eventSpy, alertSpy });
  } finally {
    eventSpy.mock.restore();
    alertSpy.mock.restore();
  }
};

before(async () => {
  pool = getPool();
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-FACE-ENABLED','CAM-FACE-DISABLED'))"
  ).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code IN ('CAM-FACE-ENABLED','CAM-FACE-DISABLED')").catch(() => {});
  testCameraId = await insertCamera({ code: "CAM-FACE-ENABLED", enabled: 1 });
  testDisabledCameraId = await insertCamera({ code: "CAM-FACE-DISABLED", enabled: 0 });
});

after(async () => {
  for (const id of createdEventIds) {
    if (id) await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (?, ?)",
    [testCameraId, testDisabledCameraId]
  ).catch(() => {});
  await cleanupCamera(testDisabledCameraId);
  await cleanupCamera(testCameraId);
  await closeDatabasePool();
});

// ---- auth / validation ----

test("face-observations missing service token is rejected with 401", async () => {
  const res = await request(app).post("/api/internal/ai/face-observations").send(faceObservation());
  assert.strictEqual(res.status, 401);
});

test("face-observations invalid token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token")
    .send(faceObservation());
  assert.strictEqual(res.status, 401);
});

test("unknown camera is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...faceObservation(), cameraCode: "CAM-DOES-NOT-EXIST" });
  assert.strictEqual(res.status, 404);
});

test("disabled camera is rejected with 400", async () => {
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...faceObservation(), cameraCode: "CAM-FACE-DISABLED" });
  assert.strictEqual(res.status, 400);
});

test("missing personTrackId is rejected with 400", async () => {
  const bad = faceObservation();
  delete bad.observations[0].personTrackId;
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("invalid faceDetectionConfidence is rejected with 400", async () => {
  const bad = faceObservation({ faceDetectionConfidence: 1.5 });
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("missing observationId is rejected with 400", async () => {
  const bad = faceObservation();
  delete bad.observations[0].observationId;
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

// ---- happy path ----

test("valid face observation creates FACE_DETECTED INFO event, emits event:new not alert:new", async () => {
  const payload = faceObservation();
  const obs = payload.observations[0];

  await withSocketMocks(async ({ eventSpy, alertSpy }) => {
    const res = await request(app)
      .post("/api/internal/ai/face-observations")
      .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
      .send(payload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.eventsCreated, 1);

    assert.strictEqual(eventSpy.mock.callCount(), 1);
    assert.strictEqual(alertSpy.mock.callCount(), 0);
  });

  const [rows] = await pool.execute(
    "SELECT * FROM events WHERE camera_id = ? AND event_type = 'FACE_DETECTED' ORDER BY id DESC LIMIT 1",
    [testCameraId]
  );
  assert.ok(rows[0], "event should exist in DB");
  createdEventIds.push(rows[0].id);
  assert.strictEqual(rows[0].event_type, "FACE_DETECTED");
  assert.strictEqual(rows[0].severity, "INFO");
  assert.strictEqual(rows[0].risk_score, null);
  assert.strictEqual(rows[0].object_type, "PERSON");
  const context = typeof rows[0].context_json === "string"
    ? JSON.parse(rows[0].context_json)
    : rows[0].context_json;
  assert.strictEqual(context.source, "AI_FACE_ENGINE");
  assert.strictEqual(context.observationId, obs.observationId);
  assert.strictEqual(context.personTrackId, 7);
  assert.strictEqual(context.detectionOnly, true);
  assert.strictEqual(context.sourceTimestampMs, 1000);
  assert.strictEqual(context.faceDetectionConfidence, 0.9);
  assert.strictEqual(context.faceBBox.x2, 140);

  const occurredYear = new Date(rows[0].occurred_at).getUTCFullYear();
  assert.ok(occurredYear > 2000, `occurred_at must not be 1970, got ${rows[0].occurred_at}`);
});

test("duplicate observationId is deduplicated", async () => {
  const payload = faceObservation({ trackId: 0 });
  const obsId = payload.observations[0].observationId;

  const first = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(first.body.data.eventsCreated, 1);

  const second = await request(app)
    .post("/api/internal/ai/face-observations")
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

test("same face track is deduplicated within a stream session and allowed after reconnect", async () => {
  const trackId = 8807;
  const first = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(faceObservation({ personTrackId: trackId, streamSessionId: "face-session-a" }));
  assert.strictEqual(first.body.data.eventsCreated, 1);

  const duplicate = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(faceObservation({ personTrackId: trackId, streamSessionId: "face-session-a" }));
  assert.strictEqual(duplicate.body.data.eventsCreated, 0);

  const afterReconnect = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(faceObservation({ personTrackId: trackId, streamSessionId: "face-session-b" }));
  assert.strictEqual(afterReconnect.body.data.eventsCreated, 1);
});

test("face observation does NOT create an alert row", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  const res = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(faceObservation({ observationId: crypto.randomUUID() }));
  assert.strictEqual(res.status, 200);
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});
