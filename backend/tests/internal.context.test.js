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
let createdZoneIds = [];
let createdEventIds = [];

const SERVICE_TOKEN = env.AI_SERVICE_TOKEN || "test-service-token";

const insertCamera = async ({ code, enabled = 1 }) => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, ?, 'VIDEO_FILE', 'ONLINE', 'ACTIVE', ?)`,
    [code, "AI Context Test " + code, enabled]
  );
  return result.insertId;
};

const cleanupCamera = async (id) => {
  if (id) {
    await pool.execute("DELETE FROM cameras WHERE id = ?", [id]).catch(() => {});
  }
};

// Shared valid context observation payload.
const contextObservation = (overrides = {}) => ({
  schemaVersion: 1,
  cameraCode: "CAM-CX-ENABLED",
  observations: [
    {
      observationId: crypto.randomUUID(),
      trackId: 7,
      objectType: "PERSON",
      contextType: "RESTRICTED_ZONE_ENTRY",
      occurredAt: new Date().toISOString(),
      sourceTimestampMs: 1840,
      streamSessionId: "context-session-a",
      referencePoint: { x: 0.53, y: 0.98 },
      metadata: { zoneCode: "ZONE-07" },
      ...overrides,
    },
  ],
});

const insertZone = async ({ code, cameraId, zoneType = "RESTRICTED" }) => {
  const [result] = await pool.execute(
    `INSERT INTO zones (zone_code, camera_id, name, zone_type, risk_level, coordinates_json, enabled)
     VALUES (?, ?, ?, ?, 'HIGH', ?, 1)`,
    [code, cameraId, "Test " + code, zoneType, JSON.stringify([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }])]
  );
  return result.insertId;
};

before(async () => {
  pool = getPool();
  // Idempotent cleanup in FK-safe order (evidence -> alerts -> zones -> events -> cameras).
  await pool.execute(
    "DELETE FROM evidence WHERE alert_id IN (SELECT id FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-CX-ENABLED','CAM-CX-DISABLED')))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-CX-ENABLED','CAM-CX-DISABLED'))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM zones WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-CX-ENABLED','CAM-CX-DISABLED'))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-CX-ENABLED','CAM-CX-DISABLED'))"
  ).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code IN ('CAM-CX-ENABLED','CAM-CX-DISABLED')").catch(() => {});
  testCameraId = await insertCamera({ code: "CAM-CX-ENABLED", enabled: 1 });
  testDisabledCameraId = await insertCamera({ code: "CAM-CX-DISABLED", enabled: 0 });
});

after(async () => {
  for (const id of createdEventIds) {
    if (id) await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  for (const id of createdZoneIds) {
    if (id) await pool.execute("DELETE FROM zones WHERE id = ?", [id]).catch(() => {});
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
  await pool.execute("DELETE FROM zones WHERE camera_id IN (?, ?)", [testCameraId, testDisabledCameraId]).catch(() => {});
  await cleanupCamera(testDisabledCameraId);
  await cleanupCamera(testCameraId);
  await closeDatabasePool();
});

// ---- context-config GET ----

test("context-config missing service token is rejected with 401", async () => {
  const res = await request(app).get("/api/internal/ai/cameras/CAM-CX-ENABLED/context-config");
  assert.strictEqual(res.status, 401);
});

test("context-config invalid token is rejected with 401", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-CX-ENABLED/context-config")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token");
  assert.strictEqual(res.status, 401);
});

test("context-config unknown camera is 404", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-DOES-NOT-EXIST/context-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 404);
});

test("context-config returns normalized zones for the camera", async () => {
  createdZoneIds.push(await insertZone({ code: "CX-ZONE-01", cameraId: testCameraId, zoneType: "RESTRICTED" }));
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-CX-ENABLED/context-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.cameraCode, "CAM-CX-ENABLED");
  assert.ok(Array.isArray(res.body.data.zones));
  const zone = res.body.data.zones.find((z) => z.zoneCode === "CX-ZONE-01");
  assert.ok(zone, "zone should be present in config");
  assert.strictEqual(zone.zoneType, "RESTRICTED");
  assert.strictEqual(zone.enabled, true);
  assert.ok(Array.isArray(zone.coordinates));
});

// ---- context-observations POST ----

test("missing service token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .send(contextObservation());
  assert.strictEqual(res.status, 401);
});

test("invalid service token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token")
    .send(contextObservation());
  assert.strictEqual(res.status, 401);
});

test("unknown camera is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...contextObservation(), cameraCode: "CAM-DOES-NOT-EXIST" });
  assert.strictEqual(res.status, 404);
});

test("disabled camera is rejected with 400", async () => {
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...contextObservation(), cameraCode: "CAM-CX-DISABLED" });
  assert.strictEqual(res.status, 400);
});

test("valid context observation creates INFO event with source=AI_CONTEXT_ENGINE", async () => {
  const payload = contextObservation();
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.eventsCreated, 1);

  const obs = payload.observations[0];
  const [rows] = await pool.execute(
    "SELECT * FROM events WHERE camera_id = ? AND track_id = ? ORDER BY id DESC LIMIT 1",
    [testCameraId, String(obs.trackId)]
  );
  assert.ok(rows[0], "event should exist in DB");
  createdEventIds.push(rows[0].id);
  assert.strictEqual(rows[0].event_type, "RESTRICTED_ZONE_ENTRY");
  assert.strictEqual(rows[0].object_type, "PERSON");
  assert.strictEqual(rows[0].severity, "INFO");
  assert.strictEqual(rows[0].risk_score, null);
  const context = typeof rows[0].context_json === "string"
    ? JSON.parse(rows[0].context_json)
    : rows[0].context_json;
  assert.strictEqual(context.source, "AI_CONTEXT_ENGINE");
  assert.strictEqual(context.observationId, obs.observationId);
  assert.strictEqual(context.contextType, "RESTRICTED_ZONE_ENTRY");
  assert.strictEqual(context.objectType, "PERSON");
  assert.strictEqual(context.metadata.zoneCode, "ZONE-07");
  assert.strictEqual(context.streamSessionId, "context-session-a");
  // Phase 9 correction: source-relative position preserved separately.
  assert.strictEqual(context.sourceTimestampMs, 1840);
  // Phase 9 correction: DB occurred_at must be a real UTC time, never 1970.
  const occurredYear = new Date(rows[0].occurred_at).getUTCFullYear();
  assert.ok(occurredYear > 2000, `occurred_at must not be 1970, got ${rows[0].occurred_at}`);
  const inputYear = new Date(obs.occurredAt).getUTCFullYear();
  assert.strictEqual(occurredYear, inputYear);
});

test("LOITERING and ZONE_PRESENCE context types are accepted", async () => {
  for (const contextType of ["LOITERING", "ZONE_PRESENCE", "VIRTUAL_FENCE_CROSSING"]) {
    const payload = contextObservation({ trackId: 21, contextType });
    const res = await request(app)
      .post("/api/internal/ai/context-observations")
      .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
      .send(payload);
    assert.strictEqual(res.status, 200, `failed for ${contextType}`);
    assert.strictEqual(res.body.data.eventsCreated, 1);
    const [rows] = await pool.execute(
      "SELECT * FROM events WHERE camera_id = ? AND track_id = ? ORDER BY id DESC LIMIT 1",
      [testCameraId, "21"]
    );
    createdEventIds.push(rows[0].id);
    assert.strictEqual(rows[0].event_type, contextType);
  }
});

test("NO alert row is created for a context event", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(contextObservation({ trackId: 99 }));
  assert.strictEqual(res.status, 200);
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

test("duplicate observationId is deduplicated", async () => {
  const payload = contextObservation({ trackId: 55 });
  const obsId = payload.observations[0].observationId;

  const first = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(first.body.data.eventsCreated, 1);

  const second = await request(app)
    .post("/api/internal/ai/context-observations")
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

test("invalid contextType is rejected with 400", async () => {
  const bad = contextObservation({ contextType: "NOT_A_REAL_TYPE" });
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("out-of-range referencePoint is rejected with 400", async () => {
  const bad = contextObservation({
    referencePoint: { x: 1.5, y: 0.5 },
  });
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("invalid streamSessionId is rejected with 400", async () => {
  const bad = contextObservation({ streamSessionId: "" });
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("missing observationId is rejected with 400", async () => {
  const bad = contextObservation();
  delete bad.observations[0].observationId;
  const res = await request(app)
    .post("/api/internal/ai/context-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});
