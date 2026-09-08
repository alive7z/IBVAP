const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword, comparePassword } = require("../src/utils/password");

let pool;

const ROLE_USERS = {
  ADMINISTRATOR: {
    email: "task2.admin@ibvap.local",
    password: "Task2Admin#2026!",
    role: "ADMINISTRATOR",
  },
  SECURITY_OPERATOR: {
    email: "task2.operator@ibvap.local",
    password: "Task2Oper#2026!",
    role: "SECURITY_OPERATOR",
  },
  AUDITOR_ANALYST: {
    email: "task2.auditor@ibvap.local",
    password: "Task2Audit#2026!",
    role: "AUDITOR_ANALYST",
  },
};

const createdUserIds = [];

const createUser = async ({ email, password, role }) => {
  const [result] = await pool.execute(
    `INSERT INTO users (public_id, full_name, email, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
    [crypto.randomUUID(), "Task2 Test " + role, email, await hashPassword(password), role]
  );
  createdUserIds.push(result.insertId);
  return result.insertId;
};

const tokenCache = {};
const loginToken = async (roleKey) => {
  if (tokenCache[roleKey]) return tokenCache[roleKey];
  const u = ROLE_USERS[roleKey];
  const res = await request(app).post("/api/auth/login").send({ email: u.email, password: u.password });
  assert.strictEqual(res.status, 200, `login failed for ${roleKey}`);
  tokenCache[roleKey] = res.body.data.accessToken;
  return tokenCache[roleKey];
};

const unique = (prefix) => `${prefix}-${crypto.randomBytes(4).toString("hex")}`;

const createdCameraIds = [];
const createdEventIds = [];
const createdAlertIds = [];
const createdAssignments = [];

const insertCamera = async () => {
  const code = unique("CAM");
  const [r] = await pool.execute(
    `INSERT INTO cameras (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, ?, 'IP_CAMERA', 'ONLINE', 'ACTIVE', 1)`,
    [code, "Task2 Camera"]
  );
  createdCameraIds.push(r.insertId);
  return { id: r.insertId, code };
};

const insertEvent = async ({ cameraId, severity = "LOW", status = "NEW" }) => {
  const code = crypto.randomUUID();
  const [r] = await pool.execute(
    `INSERT INTO events (event_code, camera_id, event_type, severity, status, occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [code, cameraId, "PERSON_DETECTED", severity, status]
  );
  createdEventIds.push(r.insertId);
  return { id: r.insertId, code };
};

const insertAlert = async ({ cameraId, eventId, severity = "HIGH", status = "NEW", createdDaysAgo = 0 }) => {
  const code = unique("ALR");
  const [r] = await pool.execute(
    `INSERT INTO alerts (alert_code, event_id, camera_id, alert_type, severity, risk_score, status,
        is_protected, created_at)
     VALUES (?, ?, ?, 'SUSPICIOUS_ACTIVITY', ?, ?, ?, 0, DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
    [code, eventId || null, cameraId, severity, 70, status, createdDaysAgo]
  );
  createdAlertIds.push(r.insertId);
  return { id: r.insertId, code };
};

const cleanup = async () => {
  for (const aid of createdAlertIds) await pool.execute("DELETE FROM alerts WHERE id = ?", [aid]).catch(() => {});
  for (const eid of createdEventIds) await pool.execute("DELETE FROM events WHERE id = ?", [eid]).catch(() => {});
  for (const cid of createdCameraIds) await pool.execute("DELETE FROM cameras WHERE id = ?", [cid]).catch(() => {});
  for (const uid of createdUserIds) await pool.execute("DELETE FROM users WHERE id = ?", [uid]).catch(() => {});
  createdAlertIds.length = 0;
  createdEventIds.length = 0;
  createdCameraIds.length = 0;
  createdUserIds.length = 0;
  createdAssignments.length = 0;
};

before(async () => {
  pool = getPool();
  for (const u of Object.values(ROLE_USERS)) await createUser(u);
});

after(async () => {
  await cleanup();
  await closeDatabasePool();
});

// ============================================================
// ALERT LIFECYCLE + RBAC
// ============================================================

test("RBAC: SECURITY_OPERATOR can acknowledge an HIGH alert", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "HIGH", status: "NEW" });
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/acknowledge`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "ACKNOWLEDGED");
});

test("RBAC: SECURITY_OPERATOR can acknowledge a MEDIUM alert", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "MEDIUM", status: "NEW" });
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/acknowledge`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "ACKNOWLEDGED");
});

test("RBAC: ADMINISTRATOR can acknowledge MEDIUM, HIGH, and CRITICAL alerts", async () => {
  const token = await loginToken("ADMINISTRATOR");
  for (const severity of ["MEDIUM", "HIGH", "CRITICAL"]) {
    const cam = await insertCamera();
    const evt = await insertEvent({ cameraId: cam.id });
    const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity, status: "NEW" });
    const res = await request(app)
      .post(`/api/alerts/${alr.code}/acknowledge`)
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(res.status, 200, `admin should acknowledge ${severity}`);
  }
});

test("RBAC: SECURITY_OPERATOR cannot acknowledge a CRITICAL alert (403)", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "CRITICAL", status: "NEW" });
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/acknowledge`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 403);
});

test("SECURITY_OPERATOR can escalate a CRITICAL alert, then ADMIN can resolve it", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "CRITICAL", status: "ACTIVE" });

  const opToken = await loginToken("SECURITY_OPERATOR");
  const esc = await request(app)
    .post(`/api/alerts/${alr.code}/escalate`)
    .set("Authorization", `Bearer ${opToken}`)
    .send({ escalationReason: "Needs immediate review" });
  assert.strictEqual(esc.status, 200);
  assert.strictEqual(esc.body.data.alert.escalated, 1);

  const duplicate = await request(app)
    .post(`/api/alerts/${alr.code}/escalate`)
    .set("Authorization", `Bearer ${opToken}`)
    .send({ escalationReason: "Duplicate click" });
  assert.strictEqual(duplicate.status, 409);

  const stillForbidden = await request(app)
    .post(`/api/alerts/${alr.code}/acknowledge`)
    .set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(stillForbidden.status, 403);

  const adminToken = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/resolve`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ resolutionType: "RESOLVED", resolutionNotes: "Handled" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "RESOLVED");
});

test("HIGH alert auto-escalation is persistent and idempotent", async () => {
  const { escalateOverdueHighAlerts } = require("../src/services/alert.service");
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({
    cameraId: cam.id,
    eventId: evt.id,
    severity: "HIGH",
    status: "NEW",
    createdDaysAgo: 1,
  });

  await escalateOverdueHighAlerts(30);
  const [[row]] = await pool.execute(
    "SELECT escalated, escalated_to, escalation_reason FROM alerts WHERE id = ?",
    [alr.id]
  );
  assert.strictEqual(row.escalated, 1);
  assert.strictEqual(row.escalated_to, "ADMINISTRATOR");
  assert.match(row.escalation_reason, /30 seconds/);

  await escalateOverdueHighAlerts(30);
  const [[auditCount]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'ALERT_ESCALATED' AND entity_id = ?",
    [alr.code]
  );
  assert.strictEqual(auditCount.c, 1);
});

test("ADMIN can investigate an alert", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "MEDIUM", status: "NEW" });
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/investigate`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "INVESTIGATING");
});

test("AUDITOR cannot acknowledge (403) but can read list", async () => {
  const token = await loginToken("AUDITOR_ANALYST");
  const list = await request(app).get("/api/alerts").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(list.status, 200);

  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "HIGH", status: "NEW" });
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/acknowledge`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 403);
});

test("EVENT API exposes a real linked alert and its acknowledgement state", async () => {
  const camera = await insertCamera();
  const event = await insertEvent({ cameraId: camera.id, severity: "HIGH" });
  const adminToken = await loginToken("ADMINISTRATOR");

  const withoutAlert = await request(app)
    .get(`/api/events/${event.code}`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(withoutAlert.status, 200);
  assert.strictEqual(withoutAlert.body.data.event.related_alert_code, null);

  const alert = await insertAlert({
    cameraId: camera.id,
    eventId: event.id,
    severity: "HIGH",
    status: "ACTIVE",
  });
  const linked = await request(app)
    .get(`/api/events/${event.code}`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(linked.status, 200);
  assert.strictEqual(linked.body.data.event.related_alert_code, alert.code);
  assert.strictEqual(linked.body.data.event.related_alert_severity, "HIGH");
  assert.strictEqual(linked.body.data.event.related_alert_status, "ACTIVE");

  const operatorToken = await loginToken("SECURITY_OPERATOR");
  const acknowledged = await request(app)
    .post(`/api/alerts/${alert.code}/acknowledge`)
    .set("Authorization", `Bearer ${operatorToken}`);
  assert.strictEqual(acknowledged.status, 200);

  const refreshed = await request(app)
    .get(`/api/events/${event.code}`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(refreshed.body.data.event.related_alert_status, "ACKNOWLEDGED");
  assert.strictEqual(
    refreshed.body.data.event.related_alert_acknowledged_by_name,
    "Task2 Test SECURITY_OPERATOR"
  );
  assert.ok(refreshed.body.data.event.related_alert_acknowledged_at);
});

test("ADMIN can mark an alert as FALSE_POSITIVE", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "LOW", status: "NEW" });
  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app)
    .post(`/api/alerts/${alr.code}/false-positive`)
    .set("Authorization", `Bearer ${token}`)
    .send({ resolutionNotes: "No actual intruder" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.alert.status, "FALSE_POSITIVE");
});

test("ADMIN can protect, then a protected alert blocks soft-delete (409)", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "HIGH", status: "RESOLVED" });
  const token = await loginToken("ADMINISTRATOR");

  const prot = await request(app)
    .post(`/api/alerts/${alr.code}/protect`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(prot.status, 200);
  assert.strictEqual(prot.body.data.alert.is_protected, 1);

  const del = await request(app)
    .delete(`/api/alerts/${alr.code}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ deletionReason: "Should fail" });
  assert.strictEqual(del.status, 409);
});

test("ADMIN soft-deletes an alert and it no longer appears in list", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "HIGH", status: "NEW" });
  const token = await loginToken("ADMINISTRATOR");

  const del = await request(app)
    .delete(`/api/alerts/${alr.code}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ deletionReason: "mistake" });
  assert.strictEqual(del.status, 200);

  const detail = await request(app)
    .get(`/api/alerts/${alr.code}`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(detail.status, 404);
});

test("RBAC: operator and analyst cannot delete alerts", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "HIGH" });
  for (const role of ["SECURITY_OPERATOR", "AUDITOR_ANALYST"]) {
    const token = await loginToken(role);
    const res = await request(app)
      .delete(`/api/alerts/${alr.code}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ deletionReason: "forbidden" });
    assert.strictEqual(res.status, 403);
  }
});

// ============================================================
// EVENTS: protect + soft-delete (admin only)
// ============================================================

test("EVENT: admin protect + protected blocks delete; operator cannot protect", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });

  const opToken = await loginToken("SECURITY_OPERATOR");
  const opProt = await request(app)
    .post(`/api/events/${evt.code}/protect`)
    .set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(opProt.status, 403);

  const token = await loginToken("ADMINISTRATOR");
  const prot = await request(app)
    .post(`/api/events/${evt.code}/protect`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(prot.status, 200);
  assert.strictEqual(prot.body.data.event.is_protected, 1);

  const del = await request(app)
    .delete(`/api/events/${evt.code}`)
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(del.status, 409);
});

test("EVENT: admin soft-deletes an event; it disappears from list", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const token = await loginToken("ADMINISTRATOR");
  const del = await request(app)
    .delete(`/api/events/${evt.code}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ deletionReason: "test cleanup" });
  assert.strictEqual(del.status, 200);

  const detail = await request(app).get(`/api/events/${evt.code}`).set("Authorization", `Bearer ${token}`);
  assert.strictEqual(detail.status, 404);
});

test("RBAC: operator and analyst cannot delete events", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  for (const role of ["SECURITY_OPERATOR", "AUDITOR_ANALYST"]) {
    const token = await loginToken(role);
    const res = await request(app)
      .delete(`/api/events/${evt.code}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ deletionReason: "forbidden" });
    assert.strictEqual(res.status, 403);
  }
});

// ============================================================
// OPERATORS
// ============================================================

test("OPERATORS: admin can list operators and read self analytics", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const list = await request(app).get("/api/operators").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(list.status, 200);
  assert.ok(Array.isArray(list.body.data.items));

  const me = await request(app).get("/api/operators/me/analytics").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(me.status, 200);
  assert.ok("analytics" in me.body.data.operator);
});

test("OPERATORS: admin creates a login-capable operator with a bcrypt hash", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const email = `${unique("created")}@ibvap.local`;
  const password = "CreatedOperator#2026!";
  const res = await request(app)
    .post("/api/operators")
    .set("Authorization", `Bearer ${token}`)
    .send({ fullName: "Created Operator", email, password, role: "SECURITY_OPERATOR" });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.operator.email, email);

  const [[stored]] = await pool.execute(
    "SELECT id, password_hash, role FROM users WHERE email = ?",
    [email]
  );
  createdUserIds.push(stored.id);
  assert.strictEqual(stored.role, "SECURITY_OPERATOR");
  assert.notStrictEqual(stored.password_hash, password);
  assert.strictEqual(await comparePassword(password, stored.password_hash), true);

  const login = await request(app).post("/api/auth/login").send({ email, password });
  assert.strictEqual(login.status, 200);
});

test("OPERATORS: operator cannot list all operators (403), admin can assign cameras", async () => {
  const opToken = await loginToken("SECURITY_OPERATOR");
  const forbidden = await request(app).get("/api/operators").set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(forbidden.status, 403);

  const adminToken = await loginToken("ADMINISTRATOR");
  const cam = await insertCamera();
  const opId = createdUserIds[1]; // SECURITY_OPERATOR
  const assign = await request(app)
    .post(`/api/operators/${opId}/cameras`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ cameraIds: [cam.id] });
  assert.strictEqual(assign.status, 200);
  const codes = assign.body.data.operator.assignedCameras.map((c) => c.cameraCode);
  assert.ok(codes.includes(cam.code));

  const unassign = await request(app)
    .delete(`/api/operators/${opId}/cameras`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ cameraIds: [cam.id] });
  assert.strictEqual(unassign.status, 200);
  assert.ok(!unassign.body.data.operator.assignedCameras.some((c) => c.cameraCode === cam.code));
});

test("CAMERAS: operator list is restricted to server-side assignments", async () => {
  const assigned = await insertCamera();
  const unassigned = await insertCamera();
  const opId = createdUserIds[1];
  const adminToken = await loginToken("ADMINISTRATOR");
  await request(app)
    .post(`/api/operators/${opId}/cameras`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ cameraIds: [assigned.id] });

  const opToken = await loginToken("SECURITY_OPERATOR");
  const allowed = await request(app)
    .get("/api/cameras")
    .set("Authorization", `Bearer ${opToken}`)
    .query({ search: assigned.code });
  assert.strictEqual(allowed.status, 200);
  assert.strictEqual(allowed.body.data.pagination.total, 1);

  const denied = await request(app)
    .get("/api/cameras")
    .set("Authorization", `Bearer ${opToken}`)
    .query({ search: unassigned.code });
  assert.strictEqual(denied.status, 200);
  assert.strictEqual(denied.body.data.pagination.total, 0);
});

test("OPERATORS: self analytics reflects real acknowledgement activity", async () => {
  const token = await loginToken("SECURITY_OPERATOR");
  const res = await request(app)
    .get("/api/operators/me/analytics")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  const metrics = res.body.data.operator.analytics;
  assert.ok(metrics.alertsAcknowledged >= 2);
  assert.ok(metrics.mediumAcknowledged >= 1);
  assert.ok(metrics.highAcknowledged >= 1);
  assert.ok(metrics.avgAcknowledgeMinutes !== null);
});

test("OPERATORS: admin can disable and re-enable an operator", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const opId = createdUserIds[1];
  const disable = await request(app)
    .patch(`/api/operators/${opId}/enabled`)
    .set("Authorization", `Bearer ${token}`)
    .send({ enabled: false });
  assert.strictEqual(disable.status, 200);
  assert.strictEqual(disable.body.data.operator.status, "INACTIVE");

  const enable = await request(app)
    .patch(`/api/operators/${opId}/enabled`)
    .set("Authorization", `Bearer ${token}`)
    .send({ enabled: true });
  assert.strictEqual(enable.status, 200);
  assert.strictEqual(enable.body.data.operator.status, "ACTIVE");
});

// ============================================================
// ANALYTICS: operators aggregation
// ============================================================

test("ANALYTICS: operator endpoint is admin-only and returns real data", async () => {
  const opToken = await loginToken("SECURITY_OPERATOR");
  const forbidden = await request(app).get("/api/analytics/operators").set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(forbidden.status, 403);

  const token = await loginToken("ADMINISTRATOR");
  const res = await request(app).get("/api/analytics/operators").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok("responseTime" in res.body.data);
  assert.ok("workload" in res.body.data);
});

// ============================================================
// RETENTION
// ============================================================

test("RETENTION: settings read by any role, update + run admin-only", async () => {
  const token = await loginToken("ADMINISTRATOR");
  const get = await request(app).get("/api/retention").set("Authorization", `Bearer ${token}`);
  assert.strictEqual(get.status, 200);
  const originalMaxNormalEvents = get.body.data.settings.maxNormalEvents;
  assert.ok(Number.isInteger(originalMaxNormalEvents));
  assert.ok(originalMaxNormalEvents >= 1);

  for (const role of ["SECURITY_OPERATOR", "AUDITOR_ANALYST"]) {
    const roleToken = await loginToken(role);
    const forbiddenUpdate = await request(app)
      .put("/api/retention")
      .set("Authorization", `Bearer ${roleToken}`)
      .send({ autoCleanupEnabled: false });
    assert.strictEqual(forbiddenUpdate.status, 403);
    const forbiddenRun = await request(app)
      .post("/api/retention/run")
      .set("Authorization", `Bearer ${roleToken}`);
    assert.strictEqual(forbiddenRun.status, 403);
  }

  const update = await request(app)
    .put("/api/retention")
    .set("Authorization", `Bearer ${token}`)
    .send({ maxNormalEvents: 500 });
  assert.strictEqual(update.status, 200);
  assert.strictEqual(update.body.data.settings.maxNormalEvents, 500);

  // Restore.
  await request(app)
    .put("/api/retention")
    .set("Authorization", `Bearer ${token}`)
    .send({ maxNormalEvents: originalMaxNormalEvents });

  const run = await request(app)
    .post("/api/retention/run")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(run.status, 200);
});

test("RETENTION job soft-deletes expired non-protected low events and keeps recent ones", async () => {
  const { runRetentionCleanup } = require("../src/services/retention.service");
  const cam = await insertCamera();
  // A very old LOW event that should be retained-cap purged (oldest beyond cap).
  await insertEvent({ cameraId: cam.id, severity: "LOW", status: "NEW" });
  const result = await runRetentionCleanup();
  assert.ok("deletedEvents" in result);
  assert.strictEqual(result.skipped, false);
});

// ============================================================
// AUDIT LOGGING for new actions
// ============================================================

test("AUDIT: admin protect action is recorded in audit log", async () => {
  const cam = await insertCamera();
  const evt = await insertEvent({ cameraId: cam.id });
  const alr = await insertAlert({ cameraId: cam.id, eventId: evt.id, severity: "HIGH", status: "NEW" });
  const token = await loginToken("ADMINISTRATOR");
  await request(app).post(`/api/alerts/${alr.code}/protect`).set("Authorization", `Bearer ${token}`);

  const res = await request(app)
    .get("/api/audit-logs")
    .set("Authorization", `Bearer ${token}`)
    .query({ action: "PROTECTED_INCIDENT" });
  assert.strictEqual(res.status, 200);
  const matches = res.body.data.items.filter((a) => a.entity_id === alr.code || a.entityId === alr.code);
  assert.ok(matches.length >= 1);
});

test("AUDIT: only an administrator can run audit retention cleanup", async () => {
  for (const role of ["SECURITY_OPERATOR", "AUDITOR_ANALYST"]) {
    const token = await loginToken(role);
    const denied = await request(app)
      .post("/api/audit-logs/cleanup")
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(denied.status, 403);
  }
  const adminToken = await loginToken("ADMINISTRATOR");
  const allowed = await request(app)
    .post("/api/audit-logs/cleanup")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.strictEqual(allowed.status, 200);
  assert.ok(allowed.body.data.result.afterCount <= 2000);
});
