const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const env = require("../src/config/env");
const alertManager = require("../src/services/alertManager.service");

let pool;
let testCameraId;
let apiUserId;
let createdAlertIds = [];
let createdEventIds = [];
let createdEvidenceIds = [];

const SERVICE_TOKEN = env.AI_SERVICE_TOKEN || "test-service-token";

const insertCamera = async ({ code, enabled = 1 }) => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, ?, 'VIDEO_FILE', 'ONLINE', 'ACTIVE', ?)`,
    [code, "AI Alert Test " + code, enabled]
  );
  return result.insertId;
};

// Direct event creation (for detection/context negative cases) mirroring how
// those events are stored by their respective ingestion services.
const insertPlainEvent = async ({ eventType, severity, cameraId, trackId }) => {
  const [result] = await pool.execute(
    `INSERT INTO events
       (event_code, camera_id, event_type, track_id, severity, context_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [crypto.randomUUID(), cameraId, eventType, String(trackId), severity, JSON.stringify({ source: "TEST" })]
  );
  createdEventIds.push(result.insertId);
  return result.insertId;
};

const riskObservation = (overrides = {}) => ({
  schemaVersion: 1,
  cameraCode: "CAM-ALERT-1",
  observations: [
    {
      observationId: crypto.randomUUID(),
      trackId: 700,
      objectType: "PERSON",
      riskScore: 68,
      riskSeverity: "HIGH",
      occurredAt: new Date().toISOString(),
      sourceTimestampMs: 1000,
      reasons: [{ code: "RESTRICTED_ZONE_ENTRY", weight: 3.0 }],
      evidence: [{ type: "RESTRICTED_ZONE_ENTRY" }],
      ...overrides,
    },
  ],
});

const postRisk = (payload) =>
  request(app)
    .post("/api/internal/ai/risk-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send(payload);

before(async () => {
  alertManager.resetMetrics();
  pool = getPool();
  // Clean any leftovers from previous runs for this camera (evidence first —
  // evidence.camera_id is SET NULL on camera delete, so orphaned rows otherwise
  // survive and pollute the demo DB).
  await pool.execute("DELETE FROM evidence WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = 'CAM-ALERT-1')").catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = 'CAM-ALERT-1')").catch(() => {});
  await pool.execute("DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = 'CAM-ALERT-1')").catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code = 'CAM-ALERT-1'").catch(() => {});
  testCameraId = await insertCamera({ code: "CAM-ALERT-1", enabled: 1 });
  const [user] = await pool.execute(
    "INSERT INTO users (public_id, full_name, email, password_hash, role, status) VALUES (?, 'Alert API Reader', ?, 'x', 'SECURITY_OPERATOR', 'ACTIVE')",
    [crypto.randomUUID(), `alert.reader.${crypto.randomUUID()}@ibvap.local`]
  );
  apiUserId = user.insertId;
});

after(async () => {
  const alertIds = createdAlertIds.length ? createdAlertIds : [0];
  // Order matters: alerts reference events (RESTRICT), events reference the
  // camera (RESTRICT), evidence is SET NULL. Clean children before parents.
  await pool.execute("DELETE FROM evidence WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM evidence WHERE alert_id IN (?)", [alertIds]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE id IN (?)", [alertIds]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE camera_id = ?", [testCameraId]).catch(() => {});
  for (const id of createdEventIds) {
    await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  await pool.execute("DELETE FROM events WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM audit_logs WHERE user_id = ?", [apiUserId]).catch(() => {});
  await pool.execute("DELETE FROM users WHERE id = ?", [apiUserId]).catch(() => {});
  await closeDatabasePool();
});

const newestAlertFor = async (camId) => {
  const [rows] = await pool.execute(
    "SELECT * FROM alerts WHERE camera_id = ? ORDER BY id DESC LIMIT 1",
    [camId]
  );
  return rows[0] || null;
};

// ── Qualification / thresholds ──

test("HIGH risk event creates a NEW alert and requests evidence", async () => {
  const res = await postRisk(riskObservation());
  assert.strictEqual(res.status, 200);
  const action = res.body.data.alertActions[0];
  assert.strictEqual(action.action, "CREATED");
  assert.strictEqual(action.evidenceRequested, true);
  assert.ok(action.alertId);
  createdAlertIds.push(action.alertId);

  const alert = await newestAlertFor(testCameraId);
  assert.ok(alert);
  assert.strictEqual(alert.status, "NEW");
  assert.strictEqual(alert.severity, "HIGH");
  assert.strictEqual(Number(alert.risk_score), 68);
  assert.strictEqual(alert.alert_type, "SUSPICIOUS_ACTIVITY");
  const reason = typeof alert.reason_json === "string" ? JSON.parse(alert.reason_json) : alert.reason_json;
  assert.ok(reason.reasons.includes("RESTRICTED_ZONE_ENTRY"));
});

test("CRITICAL risk event creates an alert with CRITICAL severity", async () => {
  const res = await postRisk(riskObservation({ trackId: 701, riskScore: 92, riskSeverity: "CRITICAL" }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alertActions[0].action, "CREATED");
  const alert = await newestAlertFor(testCameraId);
  assert.strictEqual(alert.severity, "CRITICAL");
  createdAlertIds.push(alert.id);
});

test("LOW risk event does NOT create an alert", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  const res = await postRisk(riskObservation({ trackId: 702, riskScore: 18, riskSeverity: "LOW" }));
  assert.strictEqual(res.body.data.alertActions[0].action, "NONE");
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

test("MEDIUM SUSPICIOUS_ACTIVITY creates one visible MEDIUM alert", async () => {
  assert.strictEqual(alertManager.policy().minSeverity, "MEDIUM");
  const firstPayload = riskObservation({ trackId: 703, riskScore: 52, riskSeverity: "MEDIUM" });
  const res = await postRisk(firstPayload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alertActions[0].action, "CREATED");
  const alert = await newestAlertFor(testCameraId);
  createdAlertIds.push(alert.id);
  assert.strictEqual(alert.severity, "MEDIUM");

  const list = await request(app)
    .get("/api/alerts")
    .set("Authorization", `Bearer ${operatorToken(apiUserId)}`)
    .query({ severity: "medium", search: alert.alert_code });
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.data.items.some((item) => item.alert_code === alert.alert_code));

  const duplicate = await postRisk(riskObservation({ trackId: 703, riskScore: 53, riskSeverity: "MEDIUM" }));
  assert.strictEqual(duplicate.body.data.alertActions[0].action, "DEDUPLICATED");
  const reason = typeof alert.reason_json === "string" ? JSON.parse(alert.reason_json) : alert.reason_json;
  const [[count]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ? AND severity = 'MEDIUM' AND JSON_UNQUOTE(JSON_EXTRACT(reason_json, '$.fingerprint')) = ?",
    [testCameraId, reason.fingerprint]
  );
  assert.strictEqual(count.c, 1);
});

test("detection event (PERSON_DETECTED) does NOT create an alert", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  await insertPlainEvent({ eventType: "PERSON_DETECTED", severity: "INFO", cameraId: testCameraId, trackId: 704 });
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

test("context event (RESTRICTED_ZONE_ENTRY) does NOT create an alert", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  await insertPlainEvent({ eventType: "RESTRICTED_ZONE_ENTRY", severity: "INFO", cameraId: testCameraId, trackId: 705 });
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

test("risk event missing reasons does NOT create an alert (explainability guard)", async () => {
  const beforeCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  const payload = riskObservation({ trackId: 706 });
  delete payload.observations[0].reasons;
  const res = await postRisk(payload);
  assert.strictEqual(res.body.data.alertActions[0].action, "NONE");
  const afterCount = (await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE camera_id = ?", [testCameraId]))[0][0].c;
  assert.strictEqual(afterCount, beforeCount);
});

// ── Deduplication ──

test("duplicate qualifying risk within dedup window reuses one active alert", async () => {
  const trackId = 800;
  const first = await postRisk(riskObservation({ trackId, riskScore: 68, riskSeverity: "HIGH" }));
  const firstAction = first.body.data.alertActions[0];
  createdAlertIds.push(firstAction.alertId);
  assert.strictEqual(firstAction.action, "CREATED");

  const second = await postRisk(riskObservation({ trackId, riskScore: 71, riskSeverity: "HIGH" }));
  assert.strictEqual(second.body.data.alertActions[0].action, "DEDUPLICATED");
  assert.strictEqual(second.body.data.alertActions[0].alertId, firstAction.alertId);

  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS c FROM alerts WHERE id = ?",
    [firstAction.alertId]
  );
  assert.strictEqual(rows[0].c, 1, "only one alert for the same incident");
});

test("different tracks create separate alerts", async () => {
  const a = await postRisk(riskObservation({ trackId: 810, riskScore: 70, riskSeverity: "HIGH" }));
  createdAlertIds.push(a.body.data.alertActions[0].alertId);
  const b = await postRisk(riskObservation({ trackId: 811, riskScore: 70, riskSeverity: "HIGH" }));
  createdAlertIds.push(b.body.data.alertActions[0].alertId);
  assert.strictEqual(a.body.data.alertActions[0].action, "CREATED");
  assert.strictEqual(b.body.data.alertActions[0].action, "CREATED");
  assert.notStrictEqual(a.body.data.alertActions[0].alertId, b.body.data.alertActions[0].alertId);
});

// ── Escalation / no downgrade ──

test("HIGH -> CRITICAL escalates the existing alert without a duplicate", async () => {
  const trackId = 820;
  const high = await postRisk(riskObservation({ trackId, riskScore: 70, riskSeverity: "HIGH" }));
  createdAlertIds.push(high.body.data.alertActions[0].alertId);
  assert.strictEqual(high.body.data.alertActions[0].action, "CREATED");
  const alertId = high.body.data.alertActions[0].alertId;

  const crit = await postRisk(riskObservation({ trackId, riskScore: 92, riskSeverity: "CRITICAL", sourceTimestampMs: 2000 }));
  assert.strictEqual(crit.body.data.alertActions[0].action, "ESCALATED");
  assert.strictEqual(crit.body.data.alertActions[0].alertId, alertId);

  const [rows] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [alertId]);
  assert.strictEqual(rows[0].severity, "CRITICAL");
  const [countRows] = await pool.execute("SELECT COUNT(*) AS c FROM alerts WHERE id = ?", [alertId]);
  assert.strictEqual(countRows[0].c, 1, "still one alert, not a duplicate");

  // Escalation must be audited.
  const [auditRows] = await pool.execute(
    "SELECT * FROM audit_logs WHERE action = 'ALERT_ESCALATED' AND entity_id = ? ORDER BY id DESC LIMIT 1",
    [rows[0].alert_code]
  );
  assert.ok(auditRows[0], "ALERT_ESCALATED audit record exists");
});

test("long-running same-session loitering escalates beyond the dedup window", async () => {
  const trackId = 821;
  const streamSessionId = `session-${crypto.randomUUID()}`;
  const high = await postRisk(riskObservation({
    trackId,
    streamSessionId,
    riskScore: 65,
    riskSeverity: "HIGH",
    reasons: [{ code: "LOITERING", weight: 2, durationSeconds: 60, scoreContribution: 65 }],
  }));
  const firstAction = high.body.data.alertActions[0];
  createdAlertIds.push(firstAction.alertId);
  assert.strictEqual(firstAction.action, "CREATED");

  await pool.execute(
    "UPDATE alerts SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 SECOND) WHERE id = ?",
    [firstAction.alertId]
  );

  const critical = await postRisk(riskObservation({
    trackId,
    streamSessionId,
    riskScore: 80,
    riskSeverity: "CRITICAL",
    reasons: [
      { code: "LOITERING", weight: 2, durationSeconds: 121, scoreContribution: 80 },
      { code: "FENCE_PROXIMITY", weight: 1.5 },
    ],
  }));
  assert.strictEqual(critical.body.data.alertActions[0].action, "ESCALATED");
  assert.strictEqual(critical.body.data.alertActions[0].alertId, firstAction.alertId);
});

test("reused track ID in a new stream session creates a new incident", async () => {
  const trackId = 822;
  const first = await postRisk(riskObservation({
    trackId,
    streamSessionId: `session-a-${crypto.randomUUID()}`,
    riskScore: 65,
    riskSeverity: "HIGH",
    reasons: [{ code: "LOITERING", weight: 2 }],
  }));
  createdAlertIds.push(first.body.data.alertActions[0].alertId);
  const second = await postRisk(riskObservation({
    trackId,
    streamSessionId: `session-b-${crypto.randomUUID()}`,
    riskScore: 65,
    riskSeverity: "HIGH",
    reasons: [{ code: "LOITERING", weight: 2 }],
  }));
  createdAlertIds.push(second.body.data.alertActions[0].alertId);
  assert.strictEqual(first.body.data.alertActions[0].action, "CREATED");
  assert.strictEqual(second.body.data.alertActions[0].action, "CREATED");
  assert.notStrictEqual(
    first.body.data.alertActions[0].alertId,
    second.body.data.alertActions[0].alertId
  );
});

test("CRITICAL is NOT automatically downgraded by a later HIGH observation", async () => {
  const trackId = 830;
  const crit = await postRisk(riskObservation({ trackId, riskScore: 92, riskSeverity: "CRITICAL" }));
  createdAlertIds.push(crit.body.data.alertActions[0].alertId);
  assert.strictEqual(crit.body.data.alertActions[0].action, "CREATED");

  const high = await postRisk(riskObservation({ trackId, riskScore: 70, riskSeverity: "HIGH", sourceTimestampMs: 3000 }));
  // Same incident, lower severity -> deduplicated, alert stays CRITICAL.
  assert.strictEqual(high.body.data.alertActions[0].action, "DEDUPLICATED");
  const [rows] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [crit.body.data.alertActions[0].alertId]);
  assert.strictEqual(rows[0].severity, "CRITICAL");
});

// ── Lifecycle ──

test("NEW -> ACKNOWLEDGED -> RESOLVED lifecycle works and audits", async () => {
  const res = await postRisk(riskObservation({ trackId: 840, riskScore: 70, riskSeverity: "HIGH" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);
  const [alertRows] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [alertId]);
  const alertCode = alertRows[0].alert_code;

  // Create an operator to acknowledge/resolve.
  const [userRes] = await pool.execute(
    "INSERT INTO users (public_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'SECURITY_OPERATOR', 'ACTIVE')",
    [crypto.randomUUID(), "Alert Lifecycle", `lifecycle.${alertId}@ibvap.local`, "x"]
  );
  const userId = userRes.insertId;

  // Acknowledge via public API.
  const ack = await request(app)
    .post(`/api/alerts/${alertCode}/acknowledge`)
    .set("Authorization", `Bearer ${operatorToken(userId)}`)
    .send();
  assert.strictEqual(ack.status, 200);
  const [ackRows] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [alertId]);
  assert.strictEqual(ackRows[0].status, "ACKNOWLEDGED");
  const [ackAudit] = await pool.execute(
    "SELECT * FROM audit_logs WHERE action = 'ALERT_ACKNOWLEDGED' AND entity_id = ? LIMIT 1",
    [alertCode]
  );
  assert.ok(ackAudit[0]);

  // Resolve via public API.
  const res2 = await request(app)
    .post(`/api/alerts/${alertCode}/resolve`)
    .set("Authorization", `Bearer ${operatorToken(userId)}`)
    .send({ resolutionType: "FALSE_POSITIVE", resolutionNotes: "test" });
  assert.strictEqual(res2.status, 200);
  const [resRows] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [alertId]);
  assert.strictEqual(resRows[0].status, "RESOLVED");

  await pool.execute("DELETE FROM audit_logs WHERE user_id = ?", [userId]).catch(() => {});
  await pool.execute("DELETE FROM users WHERE id = ?", [userId]).catch(() => {});
});

const operatorToken = (userId) => {
  const jwt = require("jsonwebtoken");
  return jwt.sign({ sub: String(userId), userId, role: "SECURITY_OPERATOR" }, env.JWT.SECRET, { expiresIn: "1h" });
};

test("resolved incident may create a new alert for a later same incident after window", async () => {
  const trackId = 850;
  // Create, then resolve an alert for this track.
  const first = await postRisk(riskObservation({ trackId, riskScore: 70, riskSeverity: "HIGH" }));
  const firstId = first.body.data.alertActions[0].alertId;
  createdAlertIds.push(firstId);
  await pool.execute("UPDATE alerts SET status = 'RESOLVED' WHERE id = ?", [firstId]);

  // Force the dedup window to be bypassed by backdating the first alert.
  await pool.execute("UPDATE alerts SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND) WHERE id = ?", [firstId]);

  const second = await postRisk(riskObservation({ trackId, riskScore: 72, riskSeverity: "HIGH", sourceTimestampMs: 4000 }));
  assert.strictEqual(second.body.data.alertActions[0].action, "CREATED");
  createdAlertIds.push(second.body.data.alertActions[0].alertId);
  assert.notStrictEqual(second.body.data.alertActions[0].alertId, firstId);
});

// ── Idempotency ──

test("resent observationId does not duplicate events or alerts", async () => {
  const payload = riskObservation({ trackId: 860, riskScore: 70, riskSeverity: "HIGH" });
  const first = await postRisk(payload);
  createdAlertIds.push(first.body.data.alertActions[0].alertId);
  assert.strictEqual(first.body.data.eventsCreated, 1);
  const second = await postRisk(payload);
  assert.strictEqual(second.body.data.eventsCreated, 0);
  assert.strictEqual(second.body.data.alertActions[0].action, "NONE");
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM events WHERE camera_id = ? AND
       JSON_UNQUOTE(JSON_EXTRACT(context_json, '$.observationId')) = ?`,
    [testCameraId, payload.observations[0].observationId]
  );
  assert.strictEqual(rows[0].c, 1);
});

// ── Metrics ──

test("alert manager metrics are exposed and update after decisions", async () => {
  const m = alertManager.getMetrics();
  assert.ok(m.riskEventsEvaluated >= 1);
  assert.ok(m.alertsCreated >= 1);
  assert.ok(m.alertsDeduplicated >= 1);
  assert.ok(m.alertsEscalated >= 1);
  assert.ok(m.averageDecisionLatencyMs >= 0);
});

// ── Evidence ingest ──

test("evidence metadata is accepted for a real alert and not exposed publicly", async () => {
  const res = await postRisk(riskObservation({ trackId: 870, riskScore: 70, riskSeverity: "HIGH" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);

  const evidenceId = crypto.randomUUID();
  const evidenceRes = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId,
          alertId,
          type: "SNAPSHOT",
          storageReference: "storage/evidence/snapshots/" + evidenceId + ".jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 12345,
          checksum: "a".repeat(64),
          capturedAt: new Date().toISOString(),
        },
      ],
    });
  assert.strictEqual(evidenceRes.status, 200);
  assert.strictEqual(evidenceRes.body.data.evidenceCreated, 1);
  createdEvidenceIds.push(evidenceId);

  // Public evidence detail must NOT expose file_path.
  const publicRes = await request(app)
    .get(`/api/evidence/${evidenceId}`)
    .set("Authorization", `Bearer ${operatorToken(1)}`);
  assert.strictEqual(publicRes.status, 200);
  const safe = JSON.stringify(publicRes.body);
  assert.strictEqual(safe.includes("file_path"), false);
  assert.strictEqual(safe.includes("storage/evidence"), false);
  assert.strictEqual(publicRes.body.data.evidence.evidence_code, evidenceId);
  assert.strictEqual(publicRes.body.data.evidence.evidence_type, "SNAPSHOT");
  assert.strictEqual(publicRes.body.data.evidence.checksum, "a".repeat(64));
});

test("evidence ingest is idempotent by evidenceId", async () => {
  const res = await postRisk(riskObservation({ trackId: 880, riskScore: 70, riskSeverity: "HIGH" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);
  const evidenceId = crypto.randomUUID();
  const payload = {
    schemaVersion: 1,
    cameraCode: "CAM-ALERT-1",
    evidence: [
      {
        evidenceId,
        alertId,
        type: "SNAPSHOT",
        storageReference: "storage/evidence/snapshots/" + evidenceId + ".jpg",
        fileSizeBytes: 100,
        capturedAt: new Date().toISOString(),
      },
    ],
  };
  const first = await request(app).post("/api/internal/ai/evidence").set("X-IBVAP-AI-Key", SERVICE_TOKEN).send(payload);
  assert.strictEqual(first.body.data.evidenceCreated, 1);
  const second = await request(app).post("/api/internal/ai/evidence").set("X-IBVAP-AI-Key", SERVICE_TOKEN).send(payload);
  assert.strictEqual(second.body.data.evidenceCreated, 0);
  const [rows] = await pool.execute("SELECT COUNT(*) AS c FROM evidence WHERE evidence_code = ?", [evidenceId]);
  assert.strictEqual(rows[0].c, 1);
});

test("evidence ingest for unknown alert is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId: crypto.randomUUID(),
          alertId: 999999999,
          type: "SNAPSHOT",
          storageReference: "storage/evidence/snapshots/x.jpg",
        },
      ],
    });
  assert.strictEqual(res.status, 404);
});

test("evidence endpoint requires the AI service token", async () => {
  const res = await request(app)
    .post("/api/internal/ai/evidence")
    .send({ schemaVersion: 1, cameraCode: "CAM-ALERT-1", evidence: [] });
  assert.strictEqual(res.status, 401);
});

test("FACE evidence is accepted for a real FACE_DETECTED event (event-anchored)", async () => {
  // Create an event the way the AI face service does (face-observations), which
  // returns the created event code.
  const faceRes = await request(app)
    .post("/api/internal/ai/face-observations")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      observations: [
        {
          observationId: crypto.randomUUID(),
          personTrackId: 940,
          faceDetectionConfidence: 0.91,
          occurredAt: new Date().toISOString(),
          faceBBox: { x1: 120, y1: 130, x2: 220, y2: 280 },
        },
      ],
    });
  assert.strictEqual(faceRes.status, 200);
  assert.strictEqual(faceRes.body.data.eventsCreated, 1);
  const eventCode = faceRes.body.data.events[0].eventId;
  assert.ok(eventCode, "face service should return the created event code");
  createdEventIds.push((await pool.execute("SELECT id FROM events WHERE event_code = ?", [eventCode]))[0][0].id);

  const evidenceId = crypto.randomUUID();
  const evidenceRes = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId,
          eventId: eventCode,
          type: "FACE",
          storageReference: "storage/faces/" + evidenceId + ".jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 4321,
          checksum: "b".repeat(64),
          capturedAt: new Date().toISOString(),
        },
      ],
    });
  assert.strictEqual(evidenceRes.status, 200);
  assert.strictEqual(evidenceRes.body.data.evidenceCreated, 1);
  createdEvidenceIds.push(evidenceId);

  const [rows] = await pool.execute(
    "SELECT ev.event_id, ev.alert_id, ev.evidence_type, e.event_type FROM evidence ev JOIN events e ON e.id = ev.event_id WHERE ev.evidence_code = ?",
    [evidenceId]
  );
  assert.ok(rows[0], "FACE evidence should be stored");
  assert.strictEqual(rows[0].evidence_type, "FACE");
  assert.strictEqual(rows[0].event_type, "FACE_DETECTED");
  assert.strictEqual(rows[0].alert_id, null);
  assert.ok(rows[0].event_id, "FACE evidence must be anchored to the event");
});

test("SNAPSHOT evidence without alertId is rejected with 400", async () => {
  const res = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId: crypto.randomUUID(),
          type: "SNAPSHOT",
          storageReference: "storage/snapshots/x.jpg",
        },
      ],
    });
  assert.strictEqual(res.status, 400);
});

test("FACE evidence for an unknown event is rejected with 404", async () => {
  const res = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId: crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          type: "FACE",
          storageReference: "storage/faces/x.jpg",
        },
      ],
    });
  assert.strictEqual(res.status, 404);
});

test("evidence media file is streamed for a real stored file and 404s when missing on disk", async () => {
  const fs = require("fs");
  const path = require("path");

  const res = await postRisk(riskObservation({ trackId: 905, riskScore: 70, riskSeverity: "HIGH" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);

  // Place a real binary on the shared storage volume (repo-root storage/snapshots).
  const evidenceId = crypto.randomUUID();
  const fileName = evidenceId + ".jpg";
  const absPath = path.resolve(__dirname, "..", "..", "storage", "snapshots", fileName);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const bytes = Buffer.from("FAKEDJPEGBYTES-2026", "utf8");
  fs.writeFileSync(absPath, bytes);

  try {
    const ingest = await request(app)
      .post("/api/internal/ai/evidence")
      .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
      .send({
        schemaVersion: 1,
        cameraCode: "CAM-ALERT-1",
        evidence: [
          {
            evidenceId,
            alertId,
            type: "SNAPSHOT",
            storageReference: "storage/snapshots/" + fileName,
            mimeType: "image/jpeg",
            fileSizeBytes: bytes.length,
            capturedAt: new Date().toISOString(),
          },
        ],
      });
    assert.strictEqual(ingest.body.data.evidenceCreated, 1);
    createdEvidenceIds.push(evidenceId);

    // Authenticated endpoint streams the stored binary (metadata detail does
    // not expose file_path; the binary never goes through a static route).
    const stream = await request(app)
      .get(`/api/evidence/${evidenceId}/file`)
      .set("Authorization", `Bearer ${operatorToken(1)}`)
      .buffer(true);
    assert.strictEqual(stream.status, 200);
    assert.strictEqual(stream.headers["content-type"], "image/jpeg");
    assert.ok(Buffer.from(stream.body).equals(bytes), "streamed bytes match the stored file");
  } finally {
    fs.rmSync(absPath, { force: true });
  }

  // Metadata whose backing file is gone must 404, not 500 (no manual file_path).
  const missingId = crypto.randomUUID();
  const missingIngest = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId: missingId,
          alertId,
          type: "SNAPSHOT",
          storageReference: "storage/snapshots/" + missingId + ".jpg",
          capturedAt: new Date().toISOString(),
        },
      ],
    });
  assert.strictEqual(missingIngest.body.data.evidenceCreated, 1);
  createdEvidenceIds.push(missingId);
  const missing = await request(app)
    .get(`/api/evidence/${missingId}/file`)
    .set("Authorization", `Bearer ${operatorToken(1)}`);
  assert.strictEqual(missing.status, 404);
});

test("event and alert evidence lookups return the linked evidence items", async () => {
  const res = await postRisk(riskObservation({ trackId: 906, riskScore: 70, riskSeverity: "HIGH" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);
  const evidenceId = crypto.randomUUID();

  const [alertRows] = await pool.execute("SELECT alert_code, event_id FROM alerts WHERE id = ?", [alertId]);
  const [eventRows] = await pool.execute("SELECT event_code FROM events WHERE id = ?", [alertRows[0].event_id]);
  const eventCode = eventRows[0].event_code;

  const ingest = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId,
          alertId,
          type: "SNAPSHOT",
          storageReference: "storage/snapshots/" + evidenceId + ".jpg",
          mimeType: "image/jpeg",
          capturedAt: new Date().toISOString(),
        },
      ],
    });
  assert.strictEqual(ingest.body.data.evidenceCreated, 1);
  createdEvidenceIds.push(evidenceId);

  const byEvent = await request(app)
    .get(`/api/events/${eventCode}/evidence`)
    .set("Authorization", `Bearer ${operatorToken(1)}`);
  assert.strictEqual(byEvent.status, 200);
  assert.ok(
    byEvent.body.data.items.some((i) => i.evidence_code === evidenceId),
    "evidence appears under the source event"
  );

  const byAlert = await request(app)
    .get(`/api/alerts/${alertRows[0].alert_code}/evidence`)
    .set("Authorization", `Bearer ${operatorToken(1)}`);
  assert.strictEqual(byAlert.status, 200);
  assert.ok(
    byAlert.body.data.items.some((i) => i.evidence_code === evidenceId),
    "evidence appears under the linked alert"
  );
});

test("evidence with a camera mismatch is rejected with 400", async () => {
  const res = await postRisk(riskObservation({ trackId: 890, riskScore: 70, riskSeverity: "HIGH" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);

  // A different camera that exists but did not produce this alert.
  const otherCamId = await insertCamera({ code: "CAM-ALERT-2", enabled: 1 });

  const evidenceRes = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-2",
      evidence: [
        {
          evidenceId: crypto.randomUUID(),
          alertId,
          type: "SNAPSHOT",
          storageReference: "storage/evidence/snapshots/mismatch.jpg",
        },
      ],
    });
  assert.strictEqual(evidenceRes.status, 400);

  // Clean up the other camera used for this negative case.
  await pool.execute("DELETE FROM cameras WHERE id = ?", [otherCamId]).catch(() => {});
});

test("evidence ingest accepts both SNAPSHOT and INCIDENT_CLIP in one request", async () => {
  const res = await postRisk(riskObservation({ trackId: 900, riskScore: 85, riskSeverity: "CRITICAL" }));
  const alertId = res.body.data.alertActions[0].alertId;
  createdAlertIds.push(alertId);

  const shotId = crypto.randomUUID();
  const clipId = crypto.randomUUID();
  const evidenceRes = await request(app)
    .post("/api/internal/ai/evidence")
    .set("X-IBVAP-AI-Key", SERVICE_TOKEN)
    .send({
      schemaVersion: 1,
      cameraCode: "CAM-ALERT-1",
      evidence: [
        {
          evidenceId: shotId,
          alertId,
          type: "SNAPSHOT",
          storageReference: "storage/evidence/snapshots/" + shotId + ".jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 100,
          checksum: "a".repeat(64),
          capturedAt: new Date().toISOString(),
        },
        {
          evidenceId: clipId,
          alertId,
          type: "INCIDENT_CLIP",
          storageReference: "storage/evidence/clips/" + clipId + ".mp4",
          mimeType: "video/mp4",
          fileSizeBytes: 5000,
          checksum: "b".repeat(64),
          capturedAt: new Date().toISOString(),
        },
      ],
    });
  assert.strictEqual(evidenceRes.status, 200);
  assert.strictEqual(evidenceRes.body.data.evidenceCreated, 2);
  assert.strictEqual(evidenceRes.body.data.evidence.length, 2);
  createdEvidenceIds.push(shotId, clipId);
});
