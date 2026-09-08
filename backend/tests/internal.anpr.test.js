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
    [code, "AI ANPR Test " + code, enabled]
  );
  return result.insertId;
};

const cleanupCamera = async (id) => {
  if (id) {
    await pool.execute("DELETE FROM cameras WHERE id = ?", [id]).catch(() => {});
  }
};

const anprObservation = (overrides = {}) => ({
  schemaVersion: 1,
  cameraCode: "CAM-ANPR-ENABLED",
  observations: [
    {
      observationId: crypto.randomUUID(),
      cameraCode: "CAM-ANPR-ENABLED",
      vehicleTrackId: 12,
      plateText: "KA01AB1234",
      rawText: "KA01 AB 1234",
      ocrConfidence: 0.94,
      plateDetectionConfidence: 0.8,
      occurredAt: new Date().toISOString(),
      sourceTimestampMs: 5000,
      plateBBox: { x1: 60, y1: 80, x2: 170, y2: 115 },
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
    "DELETE FROM plates WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-ANPR-ENABLED','CAM-ANPR-DISABLED'))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-ANPR-ENABLED','CAM-ANPR-DISABLED'))"
  ).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code IN ('CAM-ANPR-ENABLED','CAM-ANPR-DISABLED')").catch(() => {});
  testCameraId = await insertCamera({ code: "CAM-ANPR-ENABLED", enabled: 1 });
  testDisabledCameraId = await insertCamera({ code: "CAM-ANPR-DISABLED", enabled: 0 });
});

after(async () => {
  for (const id of createdEventIds) {
    if (id) await pool.execute("DELETE FROM plates WHERE event_id = ?", [id]).catch(() => {});
    if (id) await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  await pool.execute(
    "DELETE FROM plates WHERE camera_id IN (?, ?)",
    [testCameraId, testDisabledCameraId]
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (?, ?)",
    [testCameraId, testDisabledCameraId]
  ).catch(() => {});
  await cleanupCamera(testDisabledCameraId);
  await cleanupCamera(testCameraId);
  await closeDatabasePool();
});

// ---- auth / validation ----

test("anpr-observations missing service token is rejected with 401", async () => {
  const res = await request(app).post("/api/internal/ai/anpr-observations").send(anprObservation());
  assert.strictEqual(res.status, 401);
});

test("anpr-observations invalid token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token")
    .send(anprObservation());
  assert.strictEqual(res.status, 401);
});

test("unknown camera is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...anprObservation(), cameraCode: "CAM-DOES-NOT-EXIST" });
  assert.strictEqual(res.status, 404);
});

test("disabled camera is rejected with 400", async () => {
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...anprObservation(), cameraCode: "CAM-ANPR-DISABLED" });
  assert.strictEqual(res.status, 400);
});

test("missing plateText is rejected with 400", async () => {
  const bad = anprObservation();
  delete bad.observations[0].plateText;
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("plateText with unsupported characters is rejected with 400", async () => {
  const bad = anprObservation({ plateText: "KA01 AB!!" });
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("missing observationId is rejected with 400", async () => {
  const bad = anprObservation();
  delete bad.observations[0].observationId;
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

// ---- happy path ----

test("valid ANPR observation creates PLATE_DETECTED INFO event + plate row, emits event:new not alert:new", async () => {
  const payload = anprObservation();
  const obs = payload.observations[0];

  await withSocketMocks(async ({ eventSpy, alertSpy }) => {
    const res = await request(app)
      .post("/api/internal/ai/anpr-observations")
      .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
      .send(payload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.eventsCreated, 1);
    assert.strictEqual(res.body.data.platesCreated, 1);

    // Socket: one event:new, zero alert:new.
    assert.strictEqual(eventSpy.mock.callCount(), 1);
    assert.strictEqual(alertSpy.mock.callCount(), 0);
  });

  const [rows] = await pool.execute(
    "SELECT * FROM events WHERE camera_id = ? AND event_type = 'PLATE_DETECTED' ORDER BY id DESC LIMIT 1",
    [testCameraId]
  );
  assert.ok(rows[0], "event should exist in DB");
  createdEventIds.push(rows[0].id);
  assert.strictEqual(rows[0].event_type, "PLATE_DETECTED");
  assert.strictEqual(rows[0].severity, "INFO");
  assert.strictEqual(rows[0].risk_score, null);
  assert.strictEqual(rows[0].object_type, "VEHICLE");
  const context = typeof rows[0].context_json === "string"
    ? JSON.parse(rows[0].context_json)
    : rows[0].context_json;
  assert.strictEqual(context.source, "AI_ANPR_ENGINE");
  assert.strictEqual(context.observationId, obs.observationId);
  assert.strictEqual(context.plateText, "KA01AB1234");
  assert.strictEqual(context.vehicleTrackId, 12);
  assert.strictEqual(context.sourceTimestampMs, 5000);
  assert.strictEqual(context.plateBBox.x1, 60);

  const [plates] = await pool.execute(
    "SELECT * FROM plates WHERE event_id = ? LIMIT 1",
    [rows[0].id]
  );
  assert.ok(plates[0], "plate row should exist");
  assert.strictEqual(plates[0].plate_text, "KA01AB1234");
  assert.strictEqual(Number(plates[0].ocr_confidence), 0.94);
  assert.strictEqual(plates[0].plate_event_code, rows[0].event_code);

  const occurredYear = new Date(rows[0].occurred_at).getUTCFullYear();
  assert.ok(occurredYear > 2000, `occurred_at must not be 1970, got ${rows[0].occurred_at}`);
});

test("duplicate observationId is deduplicated (no second event or plate)", async () => {
  const payload = anprObservation({ trackId: 0 });
  const obsId = payload.observations[0].observationId;

  const first = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(first.body.data.eventsCreated, 1);

  const second = await request(app)
    .post("/api/internal/ai/anpr-observations")
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

test("same plate track is deduplicated within a stream session and allowed after reconnect", async () => {
  const trackId = 8812;
  const first = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(anprObservation({ vehicleTrackId: trackId, streamSessionId: "anpr-session-a", vehicleType: "TRUCK" }));
  assert.strictEqual(first.body.data.platesCreated, 1);

  const duplicate = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(anprObservation({ vehicleTrackId: trackId, streamSessionId: "anpr-session-a", vehicleType: "TRUCK" }));
  assert.strictEqual(duplicate.body.data.platesCreated, 0);

  const afterReconnect = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(anprObservation({ vehicleTrackId: trackId, streamSessionId: "anpr-session-b", vehicleType: "TRUCK" }));
  assert.strictEqual(afterReconnect.body.data.platesCreated, 1);

  const [rows] = await pool.execute(
    "SELECT vehicle_type FROM plates WHERE camera_id = ? AND vehicle_track_id = ?",
    [testCameraId, String(trackId)]
  );
  assert.deepStrictEqual(rows.map((row) => row.vehicle_type), ["TRUCK", "TRUCK"]);
});

test("anpr observation does NOT create an alert row", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  const res = await request(app)
    .post("/api/internal/ai/anpr-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(anprObservation({ observationId: crypto.randomUUID() }));
  assert.strictEqual(res.status, 200);
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});
