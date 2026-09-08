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
    [code, "AI Risk Test " + code, enabled]
  );
  return result.insertId;
};

const cleanupCamera = async (id) => {
  if (id) {
    await pool.execute("DELETE FROM cameras WHERE id = ?", [id]).catch(() => {});
  }
};

// Shared valid risk observation payload (SUSPICIOUS_ACTIVITY).
const riskObservation = (overrides = {}) => ({
  schemaVersion: 1,
  cameraCode: "CAM-RISK-ENABLED",
  observations: [
    {
      observationId: crypto.randomUUID(),
      trackId: 7,
      objectType: "PERSON",
      riskScore: 62.5,
      riskSeverity: "HIGH",
      occurredAt: new Date().toISOString(),
      sourceTimestampMs: 3320,
      reasons: [{ code: "RESTRICTED_ZONE_ENTRY", weight: 3.0 }],
      evidence: [{ type: "RESTRICTED_ZONE_ENTRY" }],
      ...overrides,
    },
  ],
});

before(async () => {
  pool = getPool();
  // Idempotent cleanup in FK-safe order (evidence -> alerts -> events -> cameras)
  // so leftover rows from interrupted runs never break setup.
  await pool.execute(
    "DELETE FROM evidence WHERE alert_id IN (SELECT id FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-RISK-ENABLED','CAM-RISK-DISABLED')))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-RISK-ENABLED','CAM-RISK-DISABLED'))"
  ).catch(() => {});
  await pool.execute(
    "DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code IN ('CAM-RISK-ENABLED','CAM-RISK-DISABLED'))"
  ).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code IN ('CAM-RISK-ENABLED','CAM-RISK-DISABLED')").catch(() => {});
  testCameraId = await insertCamera({ code: "CAM-RISK-ENABLED", enabled: 1 });
  testDisabledCameraId = await insertCamera({ code: "CAM-RISK-DISABLED", enabled: 0 });
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

// ---- risk-config GET ----

test("risk-config missing service token is rejected with 401", async () => {
  const res = await request(app).get("/api/internal/ai/cameras/CAM-RISK-ENABLED/risk-config");
  assert.strictEqual(res.status, 401);
});

test("risk-config invalid token is rejected with 401", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-RISK-ENABLED/risk-config")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token");
  assert.strictEqual(res.status, 401);
});

test("risk-config unknown camera is 404", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-DOES-NOT-EXIST/risk-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 404);
});

test("risk-config returns rules + severity thresholds", async () => {
  const res = await request(app)
    .get("/api/internal/ai/cameras/CAM-RISK-ENABLED/risk-config")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.cameraCode, "CAM-RISK-ENABLED");
  assert.ok(Array.isArray(res.body.data.rules));
  assert.ok(res.body.data.rules.length > 0, "should return seeded risk rules");
  const rule = res.body.data.rules.find((r) => r.ruleCode === "RESTRICTED_ZONE_ENTRY");
  assert.ok(rule, "RESTRICTED_ZONE_ENTRY rule should be present");
  // Weight is the configured demo value (5.0) — RESTRICTED+VIRTUAL_FENCE+FENCE_PROX
  // = 14/20 = 70%, which crosses the HIGH threshold during the live demo.
  assert.strictEqual(rule.weight, 5);
  assert.strictEqual(rule.enabled, true);
  const repeatedEntry = res.body.data.rules.find((r) => r.ruleCode === "REPEATED_ENTRY");
  if (repeatedEntry) {
    assert.strictEqual(repeatedEntry.runtimeSupported, false);
    assert.strictEqual(repeatedEntry.enabled, false);
  }
  // Severity thresholds present with dev defaults.
  const t = res.body.data.severityThresholds;
  assert.strictEqual(t.low, 20);
  assert.strictEqual(t.medium, 40);
  assert.strictEqual(t.high, 60);
  assert.strictEqual(t.critical, 80);
});

// ---- risk-observations POST ----

test("risk-observations missing service token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .send(riskObservation());
  assert.strictEqual(res.status, 401);
});

test("risk-observations invalid token is rejected with 401", async () => {
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", "definitely-wrong-token")
    .send(riskObservation());
  assert.strictEqual(res.status, 401);
});

test("risk-observations unknown camera is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...riskObservation(), cameraCode: "CAM-DOES-NOT-EXIST" });
  assert.strictEqual(res.status, 404);
});

test("risk-observations disabled camera is rejected with 400", async () => {
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({ ...riskObservation(), cameraCode: "CAM-RISK-DISABLED" });
  assert.strictEqual(res.status, 400);
});

test("valid risk observation creates SUSPICIOUS_ACTIVITY event with risk score + severity", async () => {
  const payload = riskObservation();
  payload.observations[0].streamSessionId = "live-session-abc";
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
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
  assert.strictEqual(rows[0].event_type, "SUSPICIOUS_ACTIVITY");
  assert.strictEqual(rows[0].severity, "HIGH");
  assert.strictEqual(Number(rows[0].risk_score), 62.5);
  assert.strictEqual(rows[0].object_type, "PERSON");
  const context = typeof rows[0].context_json === "string"
    ? JSON.parse(rows[0].context_json)
    : rows[0].context_json;
  assert.strictEqual(context.source, "AI_RISK_ENGINE");
  assert.strictEqual(context.observationId, obs.observationId);
  assert.strictEqual(context.riskScore, 62.5);
  assert.strictEqual(context.riskSeverity, "HIGH");
  assert.strictEqual(context.sourceTimestampMs, 3320);
  assert.strictEqual(context.streamSessionId, "live-session-abc");
  assert.strictEqual(context.reasons[0].code, "RESTRICTED_ZONE_ENTRY");
  assert.strictEqual(context.evidence[0].type, "RESTRICTED_ZONE_ENTRY");
  const occurredYear = new Date(rows[0].occurred_at).getUTCFullYear();
  assert.ok(occurredYear > 2000, `occurred_at must not be 1970, got ${rows[0].occurred_at}`);
});

test("every severity value is accepted", async () => {
  for (const severity of ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
    const payload = riskObservation({ trackId: 31, riskScore: 40, riskSeverity: severity });
    const res = await request(app)
      .post("/api/internal/ai/risk-observations")
      .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
      .send(payload);
    assert.strictEqual(res.status, 200, `failed for ${severity}`);
    assert.strictEqual(res.body.data.eventsCreated, 1);
    const [rows] = await pool.execute(
      "SELECT * FROM events WHERE camera_id = ? AND track_id = ? ORDER BY id DESC LIMIT 1",
      [testCameraId, "31"]
    );
    createdEventIds.push(rows[0].id);
    assert.strictEqual(rows[0].severity, severity);
    assert.strictEqual(Number(rows[0].risk_score), 40);
  }
});

test("LOW risk event does NOT create an alert", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(riskObservation({ trackId: 40, riskScore: 12, riskSeverity: "LOW" }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.eventsCreated, 1);
  assert.strictEqual(res.body.data.alertActions[0].action, "NONE");
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts"))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

test("duplicate observationId is deduplicated", async () => {
  const payload = riskObservation({ trackId: 55 });
  const obsId = payload.observations[0].observationId;

  const first = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);
  assert.strictEqual(first.body.data.eventsCreated, 1);

  const second = await request(app)
    .post("/api/internal/ai/risk-observations")
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

test("invalid severity is rejected with 400", async () => {
  const bad = riskObservation({ riskSeverity: "MEGA" });
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("out-of-range riskScore is rejected with 400", async () => {
  const bad = riskObservation({ riskScore: 150 });
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});

test("missing observationId is rejected with 400", async () => {
  const bad = riskObservation();
  delete bad.observations[0].observationId;
  const res = await request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(bad);
  assert.strictEqual(res.status, 400);
});
