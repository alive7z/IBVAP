const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");

let pool;

const ROLE_USERS = {
  ADMINISTRATOR: {
    email: "phase4.admin@ibvap.local",
    password: "Phase4Admin#2026!",
    role: "ADMINISTRATOR",
  },
  SECURITY_OPERATOR: {
    email: "phase4.operator@ibvap.local",
    password: "Phase4Oper#2026!",
    role: "SECURITY_OPERATOR",
  },
  AUDITOR_ANALYST: {
    email: "phase4.auditor@ibvap.local",
    password: "Phase4Audit#2026!",
    role: "AUDITOR_ANALYST",
  },
};

const createUser = async ({ email, password, role }) => {
  const [result] = await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
    [crypto.randomUUID(), "Phase4 Test " + role, email, await hashPassword(password), role]
  );
  return result.insertId;
};

let userIds = [];

const tokenCache = {};

const loginToken = async (roleKey) => {
  if (tokenCache[roleKey]) return tokenCache[roleKey];
  const u = ROLE_USERS[roleKey];
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: u.email, password: u.password });
  assert.strictEqual(res.status, 200, `login failed for ${roleKey}`);
  tokenCache[roleKey] = res.body.data.accessToken;
  return tokenCache[roleKey];
};

// Test fixture IDs/codes to clean up
const fixtures = {
  cameraCodes: [],
  cameraIds: [],
  zoneCodes: [],
  zoneIds: [],
  eventCodes: [],
  eventIds: [],
  alertCodes: [],
  alertIds: [],
  ruleCodes: [],
  ruleIds: [],
};

before(async () => {
  pool = getPool();
  for (const u of Object.values(ROLE_USERS)) {
    userIds.push(await createUser(u));
  }
});

after(async () => {
  const ids = [
    ...fixtures.alertIds,
    ...fixtures.eventIds,
    ...fixtures.zoneIds,
    ...fixtures.cameraIds,
    ...fixtures.ruleIds,
  ];
  for (const id of ids) {
    if (id) {
      await pool.execute("DELETE FROM alerts WHERE id = ?", [id]).catch(() => {});
      await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
      await pool.execute("DELETE FROM zones WHERE id = ?", [id]).catch(() => {});
      await pool.execute("DELETE FROM cameras WHERE id = ?", [id]).catch(() => {});
      await pool.execute("DELETE FROM risk_rules WHERE id = ?", [id]).catch(() => {});
    }
  }
  for (const id of userIds) {
    await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  }
  await closeDatabasePool();
});

const unique = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

// ============================================================
// CAMERAS
// ============================================================

test("GET /api/cameras unauthenticated returns 401", async () => {
  const res = await request(app).get("/api/cameras");
  assert.strictEqual(res.status, 401);
});

test("GET /api/cameras authenticated list returns items and no stream_url", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app).get("/api/cameras").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
  assert.ok(res.body.data.pagination);
  assert.strictEqual(res.body.data.pagination.limit, 20);
  if (res.body.data.items.length > 0) {
    assert.strictEqual(res.body.data.items[0].stream_url, undefined);
    assert.strictEqual(res.body.data.items[0].streamUrl, undefined);
  }
});

test("POST /api/cameras admin can create a mobile camera", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const code = unique("CAM");
  const res = await request(app)
    .post("/api/cameras")
    .set("Authorization", `Bearer ${token}`)
    .send({
      cameraCode: code,
      name: "Test Mobile Camera",
      description: "mobile demo",
      locationName: "Demo Area",
      sector: "Demo Sector",
      sourceType: "MOBILE",
      streamProtocol: null,
      streamUrl: null,
      enabled: true,
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.camera.cameraCode, code);
  assert.strictEqual(res.body.data.camera.sourceType, "MOBILE");
  assert.strictEqual(res.body.data.camera.stream_url, undefined);
  assert.strictEqual(res.body.data.camera.streamUrl, undefined);
  fixtures.cameraCodes.push(code);
  fixtures.cameraIds.push((await pool.execute("SELECT id FROM cameras WHERE camera_code = ?", [code]))[0][0].id);
});

test("POST /api/cameras operator cannot create (403)", async () => {
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post("/api/cameras")
    .set("Authorization", `Bearer ${token}`)
    .send({ cameraCode: unique("CAM"), name: "Should Fail" });
  assert.strictEqual(res.status, 403);
});

test("POST /api/cameras duplicate code returns 409", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const code = unique("CAM");
  await request(app)
    .post("/api/cameras")
    .set("Authorization", `Bearer ${token}`)
    .send({ cameraCode: code, name: "Original", sourceType: "IP_CAMERA" });
  const res = await request(app)
    .post("/api/cameras")
    .set("Authorization", `Bearer ${token}`)
    .send({ cameraCode: code, name: "Duplicate", sourceType: "IP_CAMERA" });
  assert.strictEqual(res.status, 409);
  fixtures.cameraIds.push((await pool.execute("SELECT id FROM cameras WHERE camera_code = ?", [code]))[0][0].id);
});

test("GET /api/cameras/:cameraId unknown returns 404", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/cameras/DOES-NOT-EXIST")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 404);
});

// ============================================================
// ZONES
// ============================================================

test("GET /api/zones authenticated returns list", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app).get("/api/zones").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("POST /api/zones admin can create with valid camera + coordinates", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const code = unique("ZONE");
  const coords = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
  ];
  const res = await request(app)
    .post("/api/zones")
    .set("Authorization", `Bearer ${token}`)
    .send({
      zoneCode: code,
      cameraCode: "CAM-01",
      name: "Test Zone",
      zoneType: "RESTRICTED",
      riskLevel: "HIGH",
      coordinates: coords,
      enabled: true,
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.zone.zone_code, code);
  assert.strictEqual(res.body.data.zone.camera_code, "CAM-01");
  fixtures.zoneCodes.push(code);
  fixtures.zoneIds.push((await pool.execute("SELECT id FROM zones WHERE zone_code = ?", [code]))[0][0].id);
});

test("POST /api/zones accepts a two-point virtual fence", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const code = unique("FENCE");
  const res = await request(app)
    .post("/api/zones")
    .set("Authorization", `Bearer ${token}`)
    .send({
      zoneCode: code,
      cameraCode: "CAM-01",
      name: "Two Point Fence",
      zoneType: "VIRTUAL_FENCE",
      riskLevel: "HIGH",
      coordinates: [{ x: 0.2, y: 0.1 }, { x: 0.2, y: 0.9 }],
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.zone.coordinates.length, 2);
  fixtures.zoneCodes.push(code);
  fixtures.zoneIds.push((await pool.execute("SELECT id FROM zones WHERE zone_code = ?", [code]))[0][0].id);

  const moved = [{ x: 0.35, y: 0.1 }, { x: 0.35, y: 0.9 }];
  const updated = await request(app)
    .patch(`/api/zones/${code}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ coordinates: moved });
  assert.strictEqual(updated.status, 200);
  assert.deepStrictEqual(updated.body.data.zone.coordinates, moved);

  const reopened = await request(app)
    .get(`/api/zones/${code}`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(reopened.status, 200);
  assert.deepStrictEqual(reopened.body.data.zone.coordinates, moved);
});

test("POST /api/zones rejects a two-point polygon", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .post("/api/zones")
    .set("Authorization", `Bearer ${token}`)
    .send({
      zoneCode: unique("ZONE"),
      cameraCode: "CAM-01",
      name: "Invalid Polygon",
      zoneType: "RESTRICTED",
      coordinates: [{ x: 0.2, y: 0.1 }, { x: 0.2, y: 0.9 }],
    });
  assert.strictEqual(res.status, 400);
});

test("POST /api/zones invalid camera rejected (400)", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .post("/api/zones")
    .set("Authorization", `Bearer ${token}`)
    .send({
      zoneCode: unique("ZONE"),
      cameraCode: "NOPE-999",
      name: "Bad",
      coordinates: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }],
    });
  assert.strictEqual(res.status, 400);
});

test("POST /api/zones invalid coordinates rejected (400)", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .post("/api/zones")
    .set("Authorization", `Bearer ${token}`)
    .send({
      zoneCode: unique("ZONE"),
      cameraCode: "CAM-01",
      name: "Bad Coords",
      coordinates: [{ x: 0.1, y: 0.1 }, { x: 5.0, y: 9.0 }],
    });
  assert.strictEqual(res.status, 400);
});

test("POST /api/zones operator cannot create (403)", async () => {
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post("/api/zones")
    .set("Authorization", `Bearer ${token}`)
    .send({
      zoneCode: unique("ZONE"),
      cameraCode: "CAM-01",
      name: "No",
      coordinates: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }],
    });
  assert.strictEqual(res.status, 403);
});

// ============================================================
// EVENTS
// ============================================================

test("GET /api/events returns list with pagination", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/events?page=1&limit=5")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
  assert.strictEqual(res.body.data.pagination.page, 1);
  assert.strictEqual(res.body.data.pagination.limit, 5);
});

test("GET /api/events filter by severity works", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/events?severity=HIGH")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  for (const item of res.body.data.items) {
    assert.strictEqual(item.severity, "HIGH");
  }
});

test("GET /api/events detail works", async () => {
  // The demo-seed fixture events are intentionally removed from the database,
  // so the detail test creates its own event row (same shape as createAlert).
  const eventCode = unique("EVT");
  const [evtRes] = await pool.execute(
    `INSERT INTO events (event_code, camera_id, event_type, severity, status, occurred_at)
     VALUES (?, (SELECT id FROM cameras WHERE camera_code='CAM-01'), 'TEST_EVT', 'LOW', 'NEW', UTC_TIMESTAMP())`,
    [eventCode]
  );
  fixtures.eventIds.push(evtRes.insertId);

  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get(`/api/events/${eventCode}`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.event.event_code, eventCode);
});

test("no event creation route exists for operators (404)", async () => {
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post("/api/events")
    .set("Authorization", `Bearer ${token}`)
    .send({});
  assert.strictEqual(res.status, 404);
});

// ============================================================
// ALERTS
// ============================================================

const createAlert = async (status = "NEW") => {
  const [evtRes] = await pool.execute(
    `INSERT INTO events (event_code, camera_id, event_type, severity, status, occurred_at)
     VALUES (?, (SELECT id FROM cameras WHERE camera_code='CAM-01'), 'TEST_EVT', 'LOW', 'NEW', UTC_TIMESTAMP())`,
    [unique("EVT")]
  );
  const eventId = evtRes.insertId;
  fixtures.eventIds.push(eventId);

  const alertCode = unique("ALR");
  const [alertRes] = await pool.execute(
    `INSERT INTO alerts (alert_code, event_id, camera_id, alert_type, severity, risk_score, status)
     VALUES (?, ?, (SELECT id FROM cameras WHERE camera_code='CAM-01'), 'TEST_ALERT', 'MEDIUM', 1.5, ?)`,
    [alertCode, eventId, status]
  );
  const alertId = alertRes.insertId;
  fixtures.alertIds.push(alertId);
  return { alertCode, alertId };
};

const auditCountFor = async (alertId, action) => {
  const alert = (await pool.execute("SELECT alert_code FROM alerts WHERE id = ?", [alertId]))[0][0];
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS c FROM audit_logs WHERE action = ? AND entity_type = 'alert' AND entity_id = ?",
    [action, alert.alert_code]
  );
  return rows[0].c;
};

test("GET /api/alerts list works", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app).get("/api/alerts").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("GET /api/alerts/:id detail works", async () => {
  const { alertCode } = await createAlert();
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app).get(`/api/alerts/${alertCode}`).set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.alert_code, alertCode);
});

test("operator can acknowledge an alert and audit entry created", async () => {
  const { alertCode, alertId } = await createAlert();
  const opToken = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post(`/api/alerts/${alertCode}/acknowledge`)
    .set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "ACKNOWLEDGED");
  const auditCount = await auditCountFor(alertId, "ALERT_ACKNOWLEDGED");
  assert.ok(auditCount >= 1);
});

test("acknowledging an already-acknowledged alert returns 409", async () => {
  const { alertCode } = await createAlert("ACKNOWLEDGED");
  const opToken = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post(`/api/alerts/${alertCode}/acknowledge`)
    .set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(res.status, 409);
});

test("operator can resolve an alert", async () => {
  const { alertCode, alertId } = await createAlert("ACKNOWLEDGED");
  const opToken = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post(`/api/alerts/${alertCode}/resolve`)
    .set("Authorization", `Bearer ${opToken}`)
    .send({ resolutionType: "NO_FURTHER_ACTION", resolutionNotes: "Reviewed." });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "RESOLVED");
  const auditCount = await auditCountFor(alertId, "ALERT_RESOLVED");
  assert.ok(auditCount >= 1);
});

test("auditor cannot acknowledge an alert (403)", async () => {
  const { alertCode } = await createAlert();
  const auditToken = await loginToken("AUDITOR_ANALYST");
  const res = await request(app)
    .post(`/api/alerts/${alertCode}/acknowledge`)
    .set("Authorization", `Bearer ${auditToken}`);
  assert.strictEqual(res.status, 403);
});

// ============================================================
// RISK RULES
// ============================================================

test("GET /api/risk-rules list works", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/risk-rules")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("admin can create and update a risk rule", async () => {
  const code = unique("RULE");
  const adminToken = await loginToken("ADMINISTRATOR");
  const created = await request(app)
    .post("/api/risk-rules")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      ruleCode: code,
      name: "Test Rule",
      category: "TEST",
      weight: 2.5,
      confidenceThreshold: 0.7,
      minimumDurationMs: 500,
      cooldownSeconds: 30,
      enabled: true,
    });
  assert.strictEqual(created.status, 201);
  const ruleId = (await pool.execute("SELECT id FROM risk_rules WHERE rule_code = ?", [code]))[0][0].id;
  fixtures.ruleIds.push(ruleId);
  assert.strictEqual(created.body.data.rule.confidence_threshold, 0.7);

  const updated = await request(app)
    .patch(`/api/risk-rules/${code}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ weight: 3.0, enabled: false });
  assert.strictEqual(updated.status, 200);
  assert.strictEqual(updated.body.data.rule.weight, 3);
  assert.strictEqual(updated.body.data.rule.enabled, false);
});

test("operator cannot modify a risk rule (403)", async () => {
  const code = "RESTRICTED_ZONE_ENTRY";
  const opToken = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .patch(`/api/risk-rules/${code}`)
    .set("Authorization", `Bearer ${opToken}`)
    .send({ weight: 1.0 });
  assert.strictEqual(res.status, 403);
});

// ============================================================
// ANALYTICS
// ============================================================

test("GET /api/analytics/overview returns expected shape", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/analytics/overview")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.cameras);
  assert.ok(res.body.data.events);
  assert.ok(res.body.data.alerts);
  assert.strictEqual(typeof res.body.data.cameras.total, "number");
});

// ============================================================
// INTELLIGENCE (plates)
// ============================================================

test("GET /api/intelligence/plates returns list shape", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/intelligence/plates")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
  assert.ok(res.body.data.pagination);
});

// ============================================================
// AUDIT
// ============================================================

test("auditor can read audit logs", async () => {
  const token = await loginToken("AUDITOR_ANALYST");
  const res = await request(app)
    .get("/api/audit-logs")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.items));
});

test("security operator cannot read audit logs (403)", async () => {
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .get("/api/audit-logs")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 403);
});

// ============================================================
// SQL INJECTION / SAFETY
// ============================================================

test("malicious sort/filter values do not error or leak", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const evil = "created_at; DROP TABLE cameras; --";
  const res = await request(app)
    .get("/api/events?sort=" + encodeURIComponent(evil) + "&page=1&limit=1000")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
});

test("invalid date range returns 400", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .get("/api/events?startDate=not-a-date")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 400);
});
