const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const app = require("../src/app");
const auditService = require("../src/services/audit.service");
const retentionSettingsService = require("../src/services/retentionSettings.service");
const userRepository = require("../src/repositories/user.repository");
const jwtUtil = require("../src/utils/jwt");
const {
  cleanAllOperationalData,
  deleteOperationalRows,
  finalizeStagedFiles,
  stageEvidenceFiles,
} = require("../src/services/operationalCleanup.service");

const requestAs = (role, body) => {
  const userId = role === "ADMINISTRATOR" ? 1 : role === "SECURITY_OPERATOR" ? 2 : 3;
  const token = jwtUtil.generateAccessToken({ userId });
  return request(app)
    .post("/api/admin/cleanup/all-operational-data")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
};

test("cleanup endpoint enforces administrator RBAC and the exact phrase", async () => {
  const originalFindUserById = userRepository.findUserById;
  const originalCleanup = retentionSettingsService.cleanAllOperationalData;
  let cleanupCalls = 0;
  userRepository.findUserById = async (id) => ({
    id,
    public_id: `test-user-${id}`,
    email: `user-${id}@ibvap.test`,
    role: id === 1 ? "ADMINISTRATOR" : id === 2 ? "SECURITY_OPERATOR" : "AUDITOR_ANALYST",
    status: "ACTIVE",
  });
  retentionSettingsService.cleanAllOperationalData = async (actor, confirmationPhrase) => {
    cleanupCalls += 1;
    assert.strictEqual(actor.role, "ADMINISTRATOR");
    assert.strictEqual(confirmationPhrase, "DELETE ALL DATA");
    return { eventsAfter: 0, alertsAfter: 0, evidenceRecordsAfter: 0 };
  };

  try {
    assert.strictEqual(
      (await requestAs("SECURITY_OPERATOR", { confirmationPhrase: "DELETE ALL DATA" })).status,
      403
    );
    assert.strictEqual(
      (await requestAs("AUDITOR_ANALYST", { confirmationPhrase: "DELETE ALL DATA" })).status,
      403
    );
    assert.strictEqual(
      (await requestAs("ADMINISTRATOR", { confirmationPhrase: "delete all data" })).status,
      400
    );
    assert.strictEqual(
      (await requestAs("ADMINISTRATOR", { confirmationPhrase: "DELETE ALL DATA " })).status,
      400
    );
    const accepted = await requestAs("ADMINISTRATOR", {
      confirmationPhrase: "DELETE ALL DATA",
    });
    assert.strictEqual(accepted.status, 200);
    assert.strictEqual(accepted.body.data.result.eventsAfter, 0);
    assert.strictEqual(cleanupCalls, 1);
  } finally {
    userRepository.findUserById = originalFindUserById;
    retentionSettingsService.cleanAllOperationalData = originalCleanup;
  }
});

test("full cleanup rejects non-admin actors and an inexact phrase before accessing data", async () => {
  await assert.rejects(
    cleanAllOperationalData({
      actor: { userId: 2, role: "SECURITY_OPERATOR" },
      confirmationPhrase: "DELETE ALL DATA",
    }),
    (err) => err.statusCode === 403
  );
  await assert.rejects(
    cleanAllOperationalData({
      actor: { userId: 1, role: "ADMINISTRATOR" },
      confirmationPhrase: "DELETE ALL DATA ",
    }),
    (err) => err.statusCode === 400
  );
});

test("DB cleanup uses child-first deletes, preserves configuration, and writes one audit", async () => {
  const before = {
    events: 11,
    alerts: 7,
    evidence: 5,
    evidence_bytes: 4096,
    plates: 3,
    users: 4,
    cameras: 2,
    zones: 6,
    risk_rules: 8,
    retention_settings: 1,
    camera_assignments: 3,
    system_health: 4,
    audit_logs: 25,
  };
  const after = {
    ...before,
    events: 0,
    alerts: 0,
    evidence: 0,
    evidence_bytes: 0,
    plates: 0,
  };
  const deleteOrder = [];
  let auditWrites = 0;
  let deletesStarted = false;
  const conn = {
    execute: async (sql) => {
      if (sql.includes("SELECT\n       (SELECT COUNT(*) FROM events)")) {
        return [[{
          ...(deletesStarted ? after : before),
          audit_logs: after.audit_logs + auditWrites,
        }]];
      }
      const match = sql.match(/^DELETE FROM (\w+)$/);
      assert.ok(match, `Unexpected SQL: ${sql}`);
      deletesStarted = true;
      deleteOrder.push(match[1]);
      return [{ affectedRows: before[match[1]] }];
    },
  };
  const originalRecordAudit = auditService.recordAudit;
  let auditPayload;
  let auditOptions;
  auditService.recordAudit = async (payload, executor, options) => {
    auditWrites += 1;
    auditPayload = payload;
    auditOptions = options;
    assert.strictEqual(executor, conn);
  };

  try {
    const cleanupId = crypto.randomUUID();
    const result = await deleteOperationalRows(conn, {
      actor: { userId: 1, role: "ADMINISTRATOR", ipAddress: "127.0.0.1" },
      cleanupId,
      fileStats: {
        snapshotFiles: 2,
        clipFiles: 1,
        faceFiles: 1,
        totalFiles: 4,
        totalBytes: 4096,
      },
    });

    assert.deepStrictEqual(deleteOrder, ["evidence", "plates", "alerts", "events"]);
    assert.deepStrictEqual(result.deletedRows, { events: 11, alerts: 7, evidence: 5, plates: 3 });
    assert.strictEqual(result.eventsAfter, 0);
    assert.strictEqual(result.alertsAfter, 0);
    assert.strictEqual(result.evidenceRecordsAfter, 0);
    assert.strictEqual(result.evidenceBytesAfter, 0);
    assert.strictEqual(result.platesAfter, 0);
    assert.strictEqual(result.preserved.users, true);
    assert.strictEqual(result.preserved.cameras, true);
    assert.strictEqual(result.preserved.zones, true);
    assert.strictEqual(result.preserved.riskRules, true);
    assert.strictEqual(result.preserved.retentionSettings, true);
    assert.strictEqual(result.preserved.cameraAssignments, true);
    assert.strictEqual(result.preserved.systemHealth, true);
    assert.strictEqual(result.preserved.auditLogs, true);
    assert.strictEqual(auditWrites, 1);
    assert.strictEqual(auditPayload.action, "ALL_OPERATIONAL_DATA_CLEANED");
    assert.strictEqual(auditPayload.userId, 1);
    assert.strictEqual(auditPayload.details.actorUserId, 1);
    assert.strictEqual(auditPayload.details.actorRole, "ADMINISTRATOR");
    assert.ok(auditPayload.details.timestamp);
    assert.deepStrictEqual(auditOptions, { enforceCap: false });
  } finally {
    auditService.recordAudit = originalRecordAudit;
  }
});

test("file cleanup removes only evidence inside approved storage directories", () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ibvap-clean-all-unit-"));
  try {
    const evidenceFiles = [
      "snapshots/one.jpg",
      "clips/nested/two.mp4",
      "faces/three.jpg",
    ];
    evidenceFiles.forEach((relative) => {
      const absolute = path.join(storageRoot, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, relative);
    });
    const preserved = path.join(storageRoot, "settings.json");
    fs.writeFileSync(preserved, "configuration");

    const stage = stageEvidenceFiles({ storageRoot, cleanupId: crypto.randomUUID() });
    assert.strictEqual(stage.stats.snapshotFiles, 1);
    assert.strictEqual(stage.stats.clipFiles, 1);
    assert.strictEqual(stage.stats.faceFiles, 1);
    assert.strictEqual(stage.stats.totalFiles, 3);
    evidenceFiles.forEach((relative) => {
      assert.strictEqual(fs.existsSync(path.join(storageRoot, relative)), false);
    });
    assert.strictEqual(fs.existsSync(preserved), true);

    finalizeStagedFiles(stage);
    assert.strictEqual(fs.existsSync(stage.quarantine), false);
    assert.strictEqual(fs.existsSync(preserved), true);
  } finally {
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
