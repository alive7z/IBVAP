const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const env = require("../src/config/env");
const retentionService = require("../src/services/retention.service");
const retentionRepository = require("../src/repositories/retention.repository");
const auditService = require("../src/services/audit.service");

let pool;
let testCameraId;
let createdEventIds = [];
let createdAlertIds = [];
let createdEvidenceIds = [];
let createdUserIds = [];
let originalSettings = null;

const TEST_CAMERA = "CAM-RET-TEST";

const insertCamera = async (code) => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, ?, 'VIDEO_FILE', 'ONLINE', 'ACTIVE', 1)`,
    [code, "Retention Test " + code]
  );
  return result.insertId;
};

const insertEvent = async ({
  severity = "INFO",
  occurredAt = "2020-01-01 00:00:00",
  trackId = 1,
  protected: isProtected = 0,
  status = "NEW",
}) =>
  pool.execute(
    `INSERT INTO events
       (event_code, camera_id, event_type, object_type, track_id, confidence, risk_score,
        severity, status, context_json, occurred_at, is_protected)
     VALUES (?, ?, 'SUSPICIOUS_ACTIVITY', 'PERSON', ?, 0.9, 55.0, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      testCameraId,
      String(trackId),
      severity,
      status,
      JSON.stringify({ source: "RETENTION_TEST" }),
      occurredAt,
      isProtected,
    ]
  );

const insertAlert = async ({
  eventId,
  severity = "HIGH",
  status = "NEW",
  riskScore = 70,
  createdAt = "2020-01-01 00:00:00",
  updatedAt = "2020-01-01 00:00:00",
  protected: isProtected = 0,
  deleted = 0,
}) =>
  pool.execute(
    `INSERT INTO alerts
       (alert_code, event_id, camera_id, alert_type, severity, risk_score, status,
        reason_json, is_protected, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, 'SUSPICIOUS_ACTIVITY', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      eventId,
      testCameraId,
      severity,
      riskScore,
      status,
      JSON.stringify({ source: "RETENTION_TEST" }),
      isProtected,
      deleted ? "2020-01-01 00:00:00" : null,
      createdAt,
      updatedAt,
    ]
  );

const insertEvidence = async ({
  eventId = null,
  alertId = null,
  type = "SNAPSHOT",
  filePath,
  capturedAt = "2020-01-01 00:00:00",
}) =>
  pool.execute(
    `INSERT INTO evidence
       (evidence_code, event_id, alert_id, camera_id, evidence_type, file_path, mime_type, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      eventId,
      alertId,
      testCameraId,
      type,
      filePath,
      type === "SNAPSHOT" ? "image/jpeg" : "video/mp4",
      capturedAt,
    ]
  );

const insertUser = async (role = "SECURITY_OPERATOR") => {
  const [result] = await pool.execute(
    "INSERT INTO users (public_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
    [crypto.randomUUID(), "Retention Tester", `ret.${crypto.randomUUID().slice(0, 8)}@ibvap.local`, "x", role]
  );
  createdUserIds.push(result.insertId);
  return result.insertId;
};

const actorFor = (userId) => ({ userId, ipAddress: "127.0.0.1" });

const newestAuditRowFor = async (userId, action) => {
  const [rows] = await pool.execute(
    "SELECT * FROM audit_logs WHERE user_id = ? AND action = ? ORDER BY id DESC LIMIT 1",
    [userId, action]
  );
  return rows[0] || null;
};

before(async () => {
  pool = getPool();
  originalSettings = await retentionRepository.getSettings();
  await pool.execute("DELETE FROM evidence WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = ?)", [TEST_CAMERA]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = ?)", [TEST_CAMERA]).catch(() => {});
  await pool.execute("DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = ?)", [TEST_CAMERA]).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code = ?", [TEST_CAMERA]).catch(() => {});
  testCameraId = await insertCamera(TEST_CAMERA);
});

after(async () => {
  if (originalSettings) {
    await retentionRepository.updateSettings(originalSettings, null).catch(() => {});
  }
  for (const uid of createdUserIds) {
    await pool.execute("DELETE FROM audit_logs WHERE user_id = ?", [uid]).catch(() => {});
    await pool.execute("DELETE FROM users WHERE id = ?", [uid]).catch(() => {});
  }
  await pool.execute("DELETE FROM evidence WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM evidence WHERE alert_id IN (?)", [createdAlertIds.length ? createdAlertIds : [0]]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE id IN (?)", [createdAlertIds.length ? createdAlertIds : [0]]).catch(() => {});
  await pool.execute("DELETE FROM events WHERE camera_id = ?", [testCameraId]).catch(() => {});
  for (const id of createdEventIds) {
    await pool.execute("DELETE FROM events WHERE id = ?", [id]).catch(() => {});
  }
  await pool.execute("DELETE FROM cameras WHERE id = ?", [testCameraId]).catch(() => {});
  await closeDatabasePool();
});

// ── Manual cleanup force + auto skip ──

test("manual cleanup runs even when auto-cleanup is disabled; auto skips", async () => {
  await retentionRepository.updateSettings({ ...originalSettings, autoCleanupEnabled: 0 }, null);

  const manual = await retentionService.runRetentionCleanup({ mode: "manual" });
  assert.strictEqual(manual.skipped, false);
  assert.strictEqual(manual.mode, "manual");
  assert.ok(typeof manual.eventsRemoved === "number");
  assert.ok(typeof manual.alertsRemoved === "number");
  assert.ok(typeof manual.durationMs === "number");
  assert.ok("evidenceRemoved" in manual, "result must include evidenceRemoved");
  assert.ok("protectedSkipped" in manual, "result must include protectedSkipped");
  assert.ok("auditLogsRemoved" in manual, "result must include auditLogsRemoved");

  const auto = await retentionService.runRetentionCleanup();
  assert.strictEqual(auto.skipped, true);
  assert.strictEqual(auto.reason, "auto_cleanup_disabled");

  await retentionRepository.updateSettings({ ...originalSettings, autoCleanupEnabled: 1 }, null);
});

// ── Event ageing / cap / protection / live-alert guard ──

test("event cleanup respects age, cap, protection and live-alert guard", async () => {
  const plain = await insertEvent({ severity: "INFO", occurredAt: "2020-01-01 00:00:00", trackId: 10 });
  createdEventIds.push(plain[0].insertId);
  const protectedEvent = await insertEvent({ severity: "INFO", occurredAt: "2020-01-01 00:00:00", trackId: 11, protected: 1 });
  createdEventIds.push(protectedEvent[0].insertId);
  const liveEv = await insertEvent({ severity: "HIGH", occurredAt: "2020-01-01 00:00:00", trackId: 12 });
  createdEventIds.push(liveEv[0].insertId);
  const liveAlert = await insertAlert({ eventId: liveEv[0].insertId, severity: "HIGH", status: "NEW", createdAt: "2026-09-06 12:00:00", updatedAt: "2026-09-06 12:00:00" });
  createdAlertIds.push(liveAlert[0].insertId);

  const res = await retentionService.runRetentionCleanup({ mode: "manual" });
  assert.strictEqual(res.skipped, false);

  const [plainRow] = await pool.execute("SELECT * FROM events WHERE id = ?", [plain[0].insertId]);
  assert.ok(plainRow[0].deleted_at, "expired normal event should be soft-deleted");
  const [protectedRow] = await pool.execute("SELECT * FROM events WHERE id = ?", [protectedEvent[0].insertId]);
  assert.strictEqual(protectedRow[0].deleted_at, null, "protected event must survive");
  const [liveRow] = await pool.execute("SELECT * FROM events WHERE id = ?", [liveEv[0].insertId]);
  assert.strictEqual(liveRow[0].deleted_at, null, "event backing a live alert must survive");
  const [alertRow] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [liveAlert[0].insertId]);
  assert.strictEqual(alertRow[0].deleted_at, null, "live alert must survive");
});

// ── Alert retention ──

test("stale RESOLVED alerts purge; fresh alerts survive", async () => {
  const evStale = await insertEvent({ severity: "HIGH", occurredAt: "2020-01-01 00:00:00", trackId: 20 });
  createdEventIds.push(evStale[0].insertId);
  const stale = await insertAlert({
    eventId: evStale[0].insertId,
    severity: "HIGH",
    status: "RESOLVED",
    createdAt: "2020-01-01 00:00:00",
    updatedAt: "2020-01-01 00:00:00",
  });
  createdAlertIds.push(stale[0].insertId);

  const evFresh = await insertEvent({ severity: "MEDIUM", occurredAt: "2026-09-06 12:00:00", trackId: 21 });
  createdEventIds.push(evFresh[0].insertId);
  const fresh = await insertAlert({
    eventId: evFresh[0].insertId,
    severity: "MEDIUM",
    status: "NEW",
    createdAt: "2026-09-06 12:00:00",
    updatedAt: "2026-09-06 12:00:00",
  });
  createdAlertIds.push(fresh[0].insertId);

  const res = await retentionService.runRetentionCleanup({ mode: "manual" });
  assert.strictEqual(res.skipped, false);
  assert.ok(res.resolvedAlertsRemoved >= 1, "resolved alert count should be reported");

  const [staleRow] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [stale[0].insertId]);
  assert.ok(staleRow[0].deleted_at, "stale RESOLVED alert should be soft-deleted");
  const [freshRow] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [fresh[0].insertId]);
  assert.strictEqual(freshRow[0].deleted_at, null, "fresh alert must survive");
});

// ── Evidence orphan cleanup ──

test("orphaned evidence (DB row + file) is cleaned; live-linked evidence survives", async () => {
  // Orphan candidate 1: alert + event soft-deleted, old file.
  const delEvent = await insertEvent({ severity: "HIGH", occurredAt: "2020-01-02 00:00:00", trackId: 30 });
  createdEventIds.push(delEvent[0].insertId);
  await pool.execute("UPDATE events SET deleted_at = '2020-01-02 00:00:00' WHERE id = ?", [delEvent[0].insertId]);
  const delAlert = await insertAlert({
    eventId: delEvent[0].insertId,
    severity: "HIGH",
    status: "RESOLVED",
    createdAt: "2020-01-02 00:00:00",
    updatedAt: "2020-01-02 00:00:00",
    deleted: 1,
  });
  createdAlertIds.push(delAlert[0].insertId);

  const shotId = crypto.randomUUID();
  const shotPath = `storage/snapshots/${shotId}.jpg`;
  const absShot = path.resolve(__dirname, "..", "..", shotPath);
  fs.mkdirSync(path.dirname(absShot), { recursive: true });
  fs.writeFileSync(absShot, Buffer.from("ORPHAN-JPEG-CONTENT"));

  const shot = await insertEvidence({ eventId: delEvent[0].insertId, alertId: delAlert[0].insertId, type: "SNAPSHOT", filePath: shotPath, capturedAt: "2020-01-02 00:00:00" });
  createdEvidenceIds.push(shot[0].insertId);

  // Orphan candidate 2: entirely parentless record, missing file on disk.
  const clip = await insertEvidence({ eventId: null, alertId: null, type: "INCIDENT_CLIP", filePath: `storage/clips/${crypto.randomUUID()}.mp4`, capturedAt: "2020-01-02 00:00:00" });
  createdEvidenceIds.push(clip[0].insertId);

  // Live-linked evidence: parent alert + event exist and are not deleted.
  const liveEv = await insertEvent({ severity: "MEDIUM", occurredAt: "2026-09-06 12:00:00", trackId: 31 });
  createdEventIds.push(liveEv[0].insertId);
  const liveAlert = await insertAlert({ eventId: liveEv[0].insertId, severity: "MEDIUM", status: "NEW", createdAt: "2026-09-06 12:00:00", updatedAt: "2026-09-06 12:00:00" });
  createdAlertIds.push(liveAlert[0].insertId);
  const liveShot = await insertEvidence({ eventId: liveEv[0].insertId, alertId: liveAlert[0].insertId, type: "SNAPSHOT", filePath: `storage/snapshots/${crypto.randomUUID()}.jpg`, capturedAt: "2026-09-06 12:00:00" });
  createdEvidenceIds.push(liveShot[0].insertId);

  const res = await retentionService.runRetentionCleanup({ mode: "manual" });
  assert.strictEqual(res.skipped, false);
  assert.ok(res.evidenceRemoved >= 2, `expected at least 2 orphan evidence rows removed, got ${res.evidenceRemoved}`);

  const [shotRow] = await pool.execute("SELECT * FROM evidence WHERE id = ?", [shot[0].insertId]);
  assert.strictEqual(shotRow.length, 0, "orphan snapshot row should be hard-deleted");
  assert.strictEqual(fs.existsSync(absShot), false, "orphan snapshot file should be removed");
  const [clipRow] = await pool.execute("SELECT * FROM evidence WHERE id = ?", [clip[0].insertId]);
  assert.strictEqual(clipRow.length, 0, "parentless clip record should be removed even without a file");

  const [liveRow] = await pool.execute("SELECT * FROM evidence WHERE id = ?", [liveShot[0].insertId]);
  assert.strictEqual(liveRow.length, 1, "evidence linked to a live alert must survive");
});

// ── Audit log retention cap ──

test("audit log cleanup trims to the cap with a single summary record", async () => {
  const userId = await insertUser();
  const before = await pool.execute("SELECT COUNT(*) AS c FROM audit_logs");
  const beforeCount = before[0][0].c;

  for (let i = 0; i < 5; i += 1) {
    await pool.execute(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, "RETENTION_TEST_MARKER", "test", `marker-${i}`, JSON.stringify({ i }), "127.0.0.1"]
    );
  }

  const result = await auditService.cleanupOldAuditLogs({
    keepCount: env.AUDIT_LOG_MAX_ROWS,
    actor: actorFor(userId),
  });

  // The single cleanup summary is inserted before the oldest rows are purged,
  // so it is retained without violating the hard cap.
  const expectedRemoved = Math.max(0, beforeCount + 5 + 1 - env.AUDIT_LOG_MAX_ROWS);
  assert.strictEqual(result.removedCount, expectedRemoved);
  assert.strictEqual(result.afterCount, env.AUDIT_LOG_MAX_ROWS);

  const [[actualCount]] = await pool.execute("SELECT COUNT(*) AS c FROM audit_logs");
  assert.strictEqual(actualCount.c, env.AUDIT_LOG_MAX_ROWS, "audit cap must be exact");
  const [newestMarkers] = await pool.execute(
    "SELECT entity_id FROM audit_logs WHERE action = 'RETENTION_TEST_MARKER' ORDER BY id"
  );
  assert.deepStrictEqual(
    newestMarkers.map((row) => row.entity_id),
    ["marker-0", "marker-1", "marker-2", "marker-3", "marker-4"],
    "newest audit rows must be preserved"
  );

  const summary = await newestAuditRowFor(userId, "AUDIT_RETENTION_CLEANUP");
  assert.ok(summary, "one AUDIT_RETENTION_CLEANUP summary record must exist");
  assert.strictEqual(summary.actor_role, "SECURITY_OPERATOR", "actor role must be snapshotted");
  if (result.removedCount > 0) {
    const details = typeof summary.details_json === "string" ? JSON.parse(summary.details_json) : summary.details_json;
    assert.strictEqual(details.removedCount, result.removedCount);
  }
});

// ── Profile update via API ──

test("PATCH /api/auth/profile updates own display name and audits it", async () => {
  const userId = await insertUser("SECURITY_OPERATOR");
  const [userRows] = await pool.execute("SELECT * FROM users WHERE id = ?", [userId]);
  const token = jwt.sign(
    { sub: userRows[0].public_id, userId, role: "SECURITY_OPERATOR" },
    env.JWT.SECRET,
    { expiresIn: "1h" }
  );

  const res = await request(app)
    .patch("/api/auth/profile")
    .set("Authorization", `Bearer ${token}`)
    .send({ fullName: "Renamed Operator" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.user.fullName, "Renamed Operator");
  assert.strictEqual(res.body.data.user.role, "SECURITY_OPERATOR");

  const [updated] = await pool.execute("SELECT full_name FROM users WHERE id = ?", [userId]);
  assert.strictEqual(updated[0].full_name, "Renamed Operator");

  const audit = await newestAuditRowFor(userId, "PROFILE_UPDATED");
  assert.ok(audit, "PROFILE_UPDATED audit record must exist");
});

test("PATCH /api/auth/profile rejects invalid names and requires auth", async () => {
  const res = await request(app).patch("/api/auth/profile").send({ fullName: "No auth" });
  assert.strictEqual(res.status, 401);

  const userId = await insertUser();
  const [userRows] = await pool.execute("SELECT * FROM users WHERE id = ?", [userId]);
  const token = jwt.sign({ sub: userRows[0].public_id, userId, role: "SECURITY_OPERATOR" }, env.JWT.SECRET, { expiresIn: "1h" });
  const blank = await request(app)
    .patch("/api/auth/profile")
    .set("Authorization", `Bearer ${token}`)
    .send({ fullName: "   " });
  assert.strictEqual(blank.status, 400);
});

test("admin and analyst can update only their own name without changing role", async () => {
  const otherUserId = await insertUser("SECURITY_OPERATOR");
  const [[otherBefore]] = await pool.execute("SELECT full_name FROM users WHERE id = ?", [otherUserId]);

  for (const role of ["ADMINISTRATOR", "AUDITOR_ANALYST"]) {
    const userId = await insertUser(role);
    const [[row]] = await pool.execute("SELECT public_id FROM users WHERE id = ?", [userId]);
    const token = jwt.sign({ sub: row.public_id, userId, role }, env.JWT.SECRET, { expiresIn: "1h" });
    const desired = `${role} Renamed`;
    const res = await request(app)
      .patch("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: desired, role: "ADMINISTRATOR", userId: otherUserId });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.user.fullName, desired);
    assert.strictEqual(res.body.data.user.role, role);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.data.user.fullName, desired, "updated name must persist on refresh");
  }

  const [[otherAfter]] = await pool.execute("SELECT full_name FROM users WHERE id = ?", [otherUserId]);
  assert.strictEqual(otherAfter.full_name, otherBefore.full_name, "profile endpoint cannot edit another user");
});

test("authenticated logout is recorded without exposing session material", async () => {
  const userId = await insertUser("SECURITY_OPERATOR");
  const [[row]] = await pool.execute("SELECT public_id FROM users WHERE id = ?", [userId]);
  const token = jwt.sign(
    { sub: row.public_id, userId, role: "SECURITY_OPERATOR" },
    env.JWT.SECRET,
    { expiresIn: "1h" }
  );
  const res = await request(app)
    .post("/api/auth/logout")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  const audit = await newestAuditRowFor(userId, "LOGOUT");
  assert.ok(audit);
  const raw = JSON.stringify(audit);
  assert.strictEqual(raw.includes(token), false);
});
